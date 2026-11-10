import type { GraphQLInputObjectType, GraphQLInputType, GraphQLSchema } from 'graphql';
import { getNamedType, isEnumType, isInputObjectType, isScalarType } from 'graphql';

export type FilterValue = { readonly [field: string]: unknown };

/**
 * Values that occur in the test data, by field name (scalar list elements are listed under the
 * name of the list field)
 */
export type ValuePools = ReadonlyMap<string, ReadonlyArray<unknown>>;

export interface FilterGeneratorOptions {
    readonly schema: GraphQLSchema;
    readonly valuePools: ValuePools;

    /** How many levels of input objects (quantifiers, relations, AND/OR) a filter can contain */
    readonly maxDepth: number;

    /**
     * The maximum number of filters taken from the nested type for each quantifier, relation,
     * reference, value object or entity extension field
     */
    readonly maxNestedFiltersPerField: number;
}

/** fields that differ between database adapters because they are generated */
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

// longer suffixes first so "_not_in" is not parsed as "_in"
const OPERATOR_SUFFIXES = [
    '_not_starts_with',
    '_not_ends_with',
    '_not_contains',
    '_starts_with',
    '_ends_with',
    '_not_like',
    '_contains',
    '_not_in',
    '_every',
    '_empty',
    '_some',
    '_none',
    '_like',
    '_not',
    '_lte',
    '_gte',
    '_in',
    '_lt',
    '_gt',
];

/**
 * Generates filters for a filter input type of the schema
 *
 * The filters cover every field of the input type with values from the test data (and null), so
 * most filters match some of the objects but not all. The generation is deterministic.
 */
export class FilterGenerator {
    private readonly cache = new Map<string, ReadonlyArray<FilterValue>>();

    constructor(private readonly options: FilterGeneratorOptions) {}

    generate(filterTypeName: string): ReadonlyArray<FilterValue> {
        const type = this.options.schema.getType(filterTypeName);
        if (!type || !isInputObjectType(type)) {
            throw new Error(`Filter type "${filterTypeName}" not found`);
        }
        return this.generateForType(type, this.options.maxDepth, undefined);
    }

    /**
     * @param scalarListField if the type is a filter for scalar list items (e.g. StringFilter for
     * tags_some), the name of the list field (to look up the values)
     */
    private generateForType(
        type: GraphQLInputObjectType,
        depth: number,
        scalarListField: string | undefined,
    ): ReadonlyArray<FilterValue> {
        const cacheKey = `${type.name}/${depth}/${scalarListField ?? ''}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // the empty filter matches everything
        const filters: FilterValue[] = [{}];
        for (const field of Object.values(type.getFields())) {
            if (field.name === 'AND' || field.name === 'OR') {
                continue;
            }
            const { baseName, operator } = parseFieldName(field.name, !!scalarListField);
            if (SYSTEM_FIELDS.has(baseName)) {
                continue;
            }
            for (const value of this.generateFieldValues({
                fieldType: field.type,
                operator,
                poolKey: scalarListField ?? baseName,
                depth,
            })) {
                filters.push({ [field.name]: value });
            }
        }

        if (depth > 1) {
            const simple = this.generateForType(type, depth - 1, scalarListField).filter(
                (f) => Object.keys(f).length,
            );
            const pairs = pickDeterministically(
                simple.flatMap((a, i) => (i + 1 < simple.length ? [[a, simple[i + 1]]] : [])),
                6,
                type.name,
            );
            filters.push({ AND: [] }, { OR: [] });
            for (const pair of pairs.slice(0, 3)) {
                filters.push({ AND: pair });
            }
            for (const pair of pairs.slice(3)) {
                filters.push({ OR: pair });
            }
            // OR with a single nested element
            filters.push({ OR: pickDeterministically(simple, 1, type.name + '/OR') });
        }

        this.cache.set(cacheKey, filters);
        return filters;
    }

    private generateFieldValues({
        fieldType,
        operator,
        poolKey,
        depth,
    }: {
        fieldType: GraphQLInputType;
        operator: string;
        poolKey: string;
        depth: number;
    }): ReadonlyArray<unknown> {
        const namedType = getNamedType(fieldType);

        if (operator === '_empty') {
            return [true, false];
        }

        if (isInputObjectType(namedType)) {
            // quantifier, to-1 relation, reference, value object or entity extension
            const isScalarListQuantifier = isScalarFilter(namedType);
            const values: unknown[] = [];
            if (depth > 1) {
                const nested = this.generateForType(
                    namedType,
                    depth - 1,
                    isScalarListQuantifier ? poolKey : undefined,
                );
                values.push(
                    ...pickDeterministically(
                        nested,
                        this.options.maxNestedFiltersPerField,
                        `${poolKey}${operator}`,
                    ),
                );
            } else {
                values.push({});
            }
            if (operator === '') {
                // e.g. "article: null" for a reference
                values.push(null);
            }
            return values;
        }

        const pool = this.getPool(namedType, poolKey);
        if (!pool.length) {
            return [null];
        }
        const first = pool[0];
        const middle = pool[Math.floor(pool.length / 2)];
        const last = pool[pool.length - 1];
        const longString = (pool as unknown[]).find(
            (v): v is string => typeof v === 'string' && v.length >= 2,
        );

        switch (operator) {
            case '':
            case '_not':
                return isBooleanPool(pool) ? [true, false, null] : [middle, null];
            case '_in':
            case '_not_in':
                return [[first, last], [middle, null], [null], []];
            case '_lt':
            case '_lte':
            case '_gt':
            case '_gte':
                return [middle, null];
            case '_contains':
            case '_not_contains':
                return longString
                    ? [longString.slice(1, -1) || longString, longString.toUpperCase(), '', null]
                    : ['', null];
            case '_starts_with':
            case '_not_starts_with':
                return longString ? [longString.slice(0, 1), '', null] : ['', null];
            case '_ends_with':
            case '_not_ends_with':
                return longString ? [longString.slice(-1), '', null] : ['', null];
            case '_like':
            case '_not_like':
                return longString
                    ? [
                          // case-insensitive prefix match
                          longString.slice(0, 1).toUpperCase() + '%',
                          // "_" placeholder
                          '_'.repeat(longString.length),
                          // escaped placeholders
                          'x\\_y',
                          '50\\%%',
                          '%',
                          '',
                          null,
                      ]
                    : ['%', null];
            default:
                throw new Error(`Unsupported filter operator "${operator}"`);
        }
    }

    private getPool(
        type: ReturnType<typeof getNamedType>,
        poolKey: string,
    ): ReadonlyArray<unknown> {
        if (isEnumType(type)) {
            return type.getValues().map((v) => v.value);
        }
        if (isScalarType(type) && type.name === 'Boolean') {
            return [false, true];
        }
        const pool = this.options.valuePools.get(poolKey);
        if (!pool) {
            throw new Error(`No values found in the test data for field "${poolKey}"`);
        }
        return pool;
    }
}

function isBooleanPool(pool: ReadonlyArray<unknown>) {
    return pool.every((v) => typeof v === 'boolean');
}

/**
 * Filter types for scalar list items (StringFilter, IntFilter, ...) have operator fields without
 * a base name (equal, not, in, ...)
 */
function isScalarFilter(type: GraphQLInputObjectType) {
    return 'equal' in type.getFields();
}

function parseFieldName(
    name: string,
    isScalarFilterType: boolean,
): { baseName: string; operator: string } {
    if (isScalarFilterType) {
        if (name === 'equal') {
            return { baseName: '', operator: '' };
        }
        return { baseName: '', operator: '_' + name };
    }
    for (const suffix of OPERATOR_SUFFIXES) {
        if (name.endsWith(suffix)) {
            return { baseName: name.slice(0, -suffix.length), operator: suffix };
        }
    }
    return { baseName: name, operator: '' };
}

/**
 * Picks up to count items, spread across the list. The first item is always included (the empty
 * filter, if present). The salt varies the offset so different fields get different items.
 */
function pickDeterministically<T>(items: ReadonlyArray<T>, count: number, salt: string): T[] {
    if (items.length <= count) {
        return [...items];
    }
    if (count <= 0) {
        return [];
    }
    const result: T[] = [items[0]];
    const rest = items.slice(1);
    const remaining = count - 1;
    const step = rest.length / remaining;
    const offset = hashString(salt) % Math.max(1, Math.floor(step));
    for (let i = 0; i < remaining; i++) {
        result.push(rest[Math.min(rest.length - 1, Math.floor(i * step) + offset)]);
    }
    return result;
}

function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

/**
 * Collects the scalar values of the test data by field name
 *
 * Values are sorted so the generated filters do not depend on the order of the test data.
 */
export function collectValuePools(data: unknown): ValuePools {
    const pools = new Map<string, Set<unknown>>();
    const visit = (value: unknown, fieldName: string | undefined) => {
        if (Array.isArray(value)) {
            for (const item of value) {
                visit(item, fieldName);
            }
            return;
        }
        if (value !== null && typeof value === 'object') {
            for (const [key, fieldValue] of Object.entries(value)) {
                visit(fieldValue, key);
            }
            return;
        }
        if (fieldName === undefined || value === null || value === undefined) {
            return;
        }
        let pool = pools.get(fieldName);
        if (!pool) {
            pool = new Set();
            pools.set(fieldName, pool);
        }
        pool.add(value);
    };
    visit(data, undefined);
    return new Map([...pools].map(([key, values]) => [key, [...values].sort(compareValues)]));
}

function compareValues(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    const lhs = String(a);
    const rhs = String(b);
    return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}
