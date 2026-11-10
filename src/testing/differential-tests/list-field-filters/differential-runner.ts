import { Database } from 'arangojs';
import { deepEqual } from 'fast-equals';
import { readFileSync } from 'fs';
import type { GraphQLObjectType, GraphQLSchema } from 'graphql';
import {
    getNamedType,
    getNullableType,
    graphql,
    isListType,
    isObjectType,
    parse,
    print,
} from 'graphql';
import { resolve } from 'path';
import { ArangoDBAdapter } from '../../../arangodb/arangodb-adapter.js';
import type { ArangoDBConfig } from '../../../arangodb/config.js';
import { ConsoleLoggerProvider } from '../../../core/config/console-logger.js';
import type { DatabaseAdapter } from '../../../core/database/database-adapter.js';
import { Project } from '../../../core/project/project.js';
import { ProjectSource } from '../../../core/project/source.js';
import { InMemoryAdapter } from '../../../inmemory/inmemory-adapter.js';
import type { FilterValue } from './filter-generator.js';
import type { TestData } from './test-data.js';
import { IDENTIFIER_FIELDS } from './test-data.js';

// arangodb only listens on ipv4, but localhost may resolve to ::1, so explicitly state 127.0.0.1
// (can be overridden to test other ArangoDB versions locally)
const ARANGODB_URL = process.env.CRUDDL_DIFFERENTIAL_ARANGODB_URL ?? 'http://127.0.0.1:8529';

// not the database of the regression tests so both can run on the same server at the same time
const ARANGODB_DATABASE_NAME = 'cruddl-test-differential';

const ORDERED_PREFIX = 'ordered_';

export function createProject(): Project {
    return new Project({
        sources: [
            new ProjectSource(
                'model.graphqls',
                readFileSync(resolve(import.meta.dirname, 'model.graphqls'), 'utf-8'),
            ),
            new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        default: { permissions: [{ access: 'readWrite', roles: ['user'] }] },
                    },
                }),
            ),
        ],
        getExecutionOptions: () => ({ authContext: { authRoles: ['user'] } }),
        // allows multiple root fields in one operation
        getOperationIdentifier: ({ info }) => info.operation,
        loggerProvider: new ConsoleLoggerProvider({ defaultLevel: 'warn' }),
    });
}

export async function createArangoDBAdapter(project: Project): Promise<ArangoDBAdapter> {
    const systemDatabase = new Database({ url: ARANGODB_URL });
    const databases = await systemDatabase.listDatabases();
    if (databases.includes(ARANGODB_DATABASE_NAME)) {
        await systemDatabase.dropDatabase(ARANGODB_DATABASE_NAME);
    }
    await systemDatabase.createDatabase(ARANGODB_DATABASE_NAME);
    const config: ArangoDBConfig = { url: ARANGODB_URL, databaseName: ARANGODB_DATABASE_NAME };
    const adapter = new ArangoDBAdapter(config, {
        loggerProvider: new ConsoleLoggerProvider({ defaultLevel: 'warn' }),
    });
    await adapter.updateSchema(project.getModel());
    return adapter;
}

export async function dropArangoDBDatabase() {
    const systemDatabase = new Database({ url: ARANGODB_URL });
    const databases = await systemDatabase.listDatabases();
    if (databases.includes(ARANGODB_DATABASE_NAME)) {
        await systemDatabase.dropDatabase(ARANGODB_DATABASE_NAME);
    }
}

export function createInMemoryAdapter(): DatabaseAdapter {
    return new InMemoryAdapter();
}

async function executeOrThrow(
    schema: GraphQLSchema,
    source: string,
    variableValues: Record<string, unknown>,
): Promise<any> {
    const result = await graphql({ schema, source, variableValues, contextValue: {} });
    if (result.errors?.length) {
        throw new Error(
            `GraphQL errors in ${source}: ${result.errors.map((e) => e.message).join('\n')}`,
        );
    }
    return result.data;
}

/**
 * Creates the test data via GraphQL mutations so it is stored the same way in every adapter
 */
export async function insertTestData(schema: GraphQLSchema, data: TestData) {
    const ids = new Map<string, string>();
    for (const [typeName, entities] of Object.entries(data.entities)) {
        for (const entity of entities) {
            const result = await executeOrThrow(
                schema,
                `mutation($input: Create${typeName}Input!) { create${typeName}(input: $input) { id } }`,
                { input: entity },
            );
            const key = entity[IDENTIFIER_FIELDS[typeName]] as string;
            ids.set(`${typeName}/${key}`, result[`create${typeName}`].id);
        }
    }

    const getId = (typeName: string, key: string) => {
        const id = ids.get(`${typeName}/${key}`);
        if (!id) {
            throw new Error(`Test data does not contain ${typeName} ${key}`);
        }
        return id;
    };

    for (const relation of data.relations) {
        const targetIds =
            typeof relation.targetKeys === 'string'
                ? getId(relation.targetTypeName, relation.targetKeys)
                : relation.targetKeys.map((key) => getId(relation.targetTypeName, key));
        await executeOrThrow(
            schema,
            `mutation($input: Update${relation.typeName}Input!) { update${relation.typeName}(input: $input) { id } }`,
            {
                input: {
                    id: getId(relation.typeName, relation.key),
                    [relation.inputField]: targetIds,
                },
            },
        );
    }
}

/**
 * A list field with a filter argument, reachable from a root query
 */
export interface FilterTarget {
    /**
     * The fields from the root query to the list field. If it only contains the root query
     * field, the filter is applied on the root query.
     */
    readonly path: ReadonlyArray<PathSegment>;

    readonly elementTypeName: string;
    readonly filterTypeName: string;
}

interface PathSegment {
    readonly fieldName: string;
    readonly typeName: string;
    readonly isList: boolean;
}

export function describeTarget(target: FilterTarget) {
    return target.path.map((s) => s.fieldName).join('.');
}

/**
 * Finds all list fields that accept filters, starting at the root query fields and following
 * child entities, value objects and entity extensions (but not relations and references, whose
 * list fields are reachable from their own root query)
 *
 * @param maxNestedDepth how many fields to follow below the root entity
 */
export function findFilterTargets(
    schema: GraphQLSchema,
    maxNestedDepth: number,
): ReadonlyArray<FilterTarget> {
    const targets: FilterTarget[] = [];
    const queryType = schema.getQueryType()!;

    const visit = (type: GraphQLObjectType, path: ReadonlyArray<PathSegment>, depth: number) => {
        for (const field of Object.values(type.getFields())) {
            if (field.name.startsWith('_')) {
                continue;
            }
            const namedType = getNamedType(field.type);
            if (!isObjectType(namedType)) {
                continue;
            }
            const isList = isListType(getNullableType(field.type));
            const segment: PathSegment = {
                fieldName: field.name,
                typeName: namedType.name,
                isList,
            };
            const filterArg = field.args.find((a) => a.name === 'filter');
            if (isList && filterArg) {
                targets.push({
                    path: [...path, segment],
                    elementTypeName: namedType.name,
                    filterTypeName: getNamedType(filterArg.type).name,
                });
            }
            const isRootEntity = '_revision' in namedType.getFields();
            // follow recursive fields like subItems only once per path
            const isRecursion = path.some(
                (s) => s.fieldName === field.name && s.typeName === namedType.name,
            );
            if (!isRootEntity && !isRecursion && depth < maxNestedDepth) {
                visit(namedType, [...path, segment], depth + 1);
            }
        }
    };

    for (const field of Object.values(queryType.getFields())) {
        const namedType = getNamedType(field.type);
        if (!isObjectType(namedType) || !isListType(getNullableType(field.type))) {
            continue;
        }
        const filterArg = field.args.find((a) => a.name === 'filter');
        if (!filterArg) {
            continue;
        }
        const segment: PathSegment = {
            fieldName: field.name,
            typeName: namedType.name,
            isList: true,
        };
        targets.push({
            path: [segment],
            elementTypeName: namedType.name,
            filterTypeName: getNamedType(filterArg.type).name,
        });
        visit(namedType, [segment], 0);
    }
    return targets;
}

function getIdentifierField(typeName: string) {
    const field = IDENTIFIER_FIELDS[typeName];
    if (!field) {
        throw new Error(`No identifier field defined for type ${typeName}`);
    }
    return field;
}

function getMetaFieldName(fieldName: string) {
    return `_${fieldName}Meta`;
}

/**
 * Builds a query that applies the filter variable $filter on each of the given targets (which
 * need to have the same filter type)
 *
 * Each target is queried as list, as _Meta count, ordered descending, and ordered with skip and
 * first. Aliases with the ORDERED_PREFIX mark results whose order is relevant.
 */
export function buildQuery(targets: ReadonlyArray<FilterTarget>): string {
    const filterTypeName = targets[0].filterTypeName;
    const selections = targets.map((target, index) => {
        const alias = `t${index}`;
        const path = target.path;
        const last = path[path.length - 1];
        const identifier = getIdentifierField(last.typeName);
        const filteredFields = (prefix: string, fieldName: string, metaFieldName: string) =>
            [
                `${prefix}list: ${fieldName}(filter: $filter) { ${identifier} }`,
                `${prefix}count: ${metaFieldName}(filter: $filter) { count }`,
                `${ORDERED_PREFIX}${prefix}desc: ${fieldName}(filter: $filter, orderBy: ${identifier}_DESC) { ${identifier} }`,
                `${ORDERED_PREFIX}${prefix}page: ${fieldName}(filter: $filter, orderBy: ${identifier}_ASC, skip: 1, first: 2) { ${identifier} }`,
            ].join('\n');

        if (path.length === 1) {
            const metaFieldName = getMetaFieldName(last.fieldName);
            return filteredFields(`${alias}_`, last.fieldName, metaFieldName);
        }

        let inner = filteredFields('', last.fieldName, getMetaFieldName(last.fieldName));
        for (let i = path.length - 2; i >= 0; i--) {
            const segment = path[i];
            const identifierSelection = segment.isList
                ? getIdentifierField(segment.typeName) + '\n'
                : '';
            const fieldAlias = i === 0 ? `${alias}: ` : '';
            inner = `${fieldAlias}${segment.fieldName} { ${identifierSelection}${inner} }`;
        }
        return inner;
    });
    const source = `query($filter: ${filterTypeName}) {\n${selections.join('\n')}\n}`;
    // normalize formatting (and fail early on syntax errors)
    return print(parse(source));
}

/**
 * Sorts all lists whose order is not relevant so results can be compared as multisets
 */
export function normalizeResult(value: unknown, isOrdered = false): unknown {
    if (Array.isArray(value)) {
        const items = value.map((item) => normalizeResult(item));
        if (isOrdered) {
            return items;
        }
        return items
            .map((item) => ({ item, key: JSON.stringify(item) }))
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
            .map(({ item }) => item);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, fieldValue]) => [
                key,
                normalizeResult(fieldValue, key.startsWith(ORDERED_PREFIX)),
            ]),
        );
    }
    return value;
}

export interface Difference {
    readonly filterTypeName: string;
    readonly filter: FilterValue;
    readonly target: string;
    /** "error" if at least one of the adapters reported an error, "result" otherwise */
    readonly kind: 'error' | 'result';
    readonly inMemory: unknown;
    readonly arangoDB: unknown;
}

interface ExecutionOutcome {
    readonly data?: Record<string, unknown>;
    readonly errors?: ReadonlyArray<string>;
    readonly durationInMs: number;
}

export interface Timings {
    inMemoryInMs: number;
    arangoDBInMs: number;
    slowest: { filter: FilterValue; durationInMs: number; adapter: string }[];
}

export function createTimings(): Timings {
    return { inMemoryInMs: 0, arangoDBInMs: 0, slowest: [] };
}

function recordTiming(
    timings: Timings,
    adapter: string,
    filter: FilterValue,
    durationInMs: number,
) {
    if (adapter === 'InMemory') {
        timings.inMemoryInMs += durationInMs;
    } else {
        timings.arangoDBInMs += durationInMs;
    }
    timings.slowest.push({ filter, durationInMs, adapter });
    timings.slowest.sort((a, b) => b.durationInMs - a.durationInMs);
    timings.slowest.length = Math.min(timings.slowest.length, 5);
}

async function execute(
    schema: GraphQLSchema,
    source: string,
    filter: FilterValue,
): Promise<ExecutionOutcome> {
    const start = performance.now();
    try {
        const result = await graphql({
            schema,
            source,
            variableValues: { filter },
            contextValue: {},
        });
        const durationInMs = performance.now() - start;
        if (result.errors?.length) {
            return { errors: [...new Set(result.errors.map((e) => e.message))], durationInMs };
        }
        return {
            data: normalizeResult(result.data) as Record<string, unknown>,
            durationInMs,
        };
    } catch (e) {
        return { errors: [(e as Error).message], durationInMs: performance.now() - start };
    }
}

export interface DifferentialContext {
    readonly inMemorySchema: GraphQLSchema;
    readonly arangoDBSchema: GraphQLSchema;
    readonly timings: Timings;
}

/**
 * Runs the filter on all targets in both adapters and returns the differences
 *
 * All targets are queried in one operation. If it fails, each target is queried on its own so
 * an error in one target does not hide differences in the others.
 */
export async function compareFilter(
    context: DifferentialContext,
    targets: ReadonlyArray<FilterTarget>,
    filter: FilterValue,
): Promise<Difference[]> {
    const source = buildQuery(targets);
    const [inMemory, arangoDB] = await Promise.all([
        execute(context.inMemorySchema, source, filter),
        execute(context.arangoDBSchema, source, filter),
    ]);
    recordTiming(context.timings, 'InMemory', filter, inMemory.durationInMs);
    recordTiming(context.timings, 'ArangoDB', filter, arangoDB.durationInMs);
    const filterTypeName = targets[0].filterTypeName;

    if (inMemory.errors || arangoDB.errors) {
        if (targets.length > 1) {
            const results = [];
            for (const target of targets) {
                results.push(...(await compareFilter(context, [target], filter)));
            }
            return results;
        }
        return [
            {
                filterTypeName,
                filter,
                target: describeTarget(targets[0]),
                kind: 'error',
                inMemory: inMemory.errors ?? 'no error',
                arangoDB: arangoDB.errors ?? 'no error',
            },
        ];
    }

    const differences: Difference[] = [];
    targets.forEach((target, index) => {
        const keys = Object.keys(inMemory.data!).filter(
            (key) =>
                key === `t${index}` ||
                key.startsWith(`t${index}_`) ||
                key.startsWith(`${ORDERED_PREFIX}t${index}_`),
        );
        if (keys.some((key) => !deepEqual(inMemory.data![key], arangoDB.data![key]))) {
            differences.push({
                filterTypeName,
                filter,
                target: describeTarget(target),
                kind: 'result',
                inMemory: pick(inMemory.data!, keys),
                arangoDB: pick(arangoDB.data!, keys),
            });
        }
    });
    return differences;
}

/**
 * Runs the filter on targets that the InMemoryAdapter does not support and only checks that
 * ArangoDB does not report an error
 */
export async function checkFilterOnArangoDB(
    context: DifferentialContext,
    targets: ReadonlyArray<FilterTarget>,
    filter: FilterValue,
): Promise<Difference[]> {
    const source = buildQuery(targets);
    const arangoDB = await execute(context.arangoDBSchema, source, filter);
    recordTiming(context.timings, 'ArangoDB', filter, arangoDB.durationInMs);
    if (!arangoDB.errors) {
        return [];
    }
    if (targets.length > 1) {
        const results = [];
        for (const target of targets) {
            results.push(...(await checkFilterOnArangoDB(context, [target], filter)));
        }
        return results;
    }
    return [
        {
            filterTypeName: targets[0].filterTypeName,
            filter,
            target: describeTarget(targets[0]),
            kind: 'error',
            inMemory: 'not supported',
            arangoDB: arangoDB.errors,
        },
    ];
}

/**
 * Checks whether the InMemoryAdapter supports the target at all (it does not support relation
 * depth ranges like childHandlingUnits{0,2})
 */
export async function isSupportedByInMemoryAdapter(
    inMemorySchema: GraphQLSchema,
    target: FilterTarget,
): Promise<boolean> {
    const result = await execute(inMemorySchema, buildQuery([target]), {});
    return !result.errors?.some((e) => e.includes('not supported by InMemoryAdapter'));
}

function pick(obj: Record<string, unknown>, keys: ReadonlyArray<string>) {
    return Object.fromEntries(keys.map((key) => [key, obj[key]]));
}

/**
 * Runs the tasks with limited concurrency, keeping the order of the results
 */
export async function runConcurrently<T>(
    tasks: ReadonlyArray<() => Promise<T>>,
    concurrency: number,
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let next = 0;
    const worker = async () => {
        while (next < tasks.length) {
            const index = next++;
            results[index] = await tasks[index]();
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
    return results;
}
