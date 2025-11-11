import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { graphql, GraphQLSchema, OperationDefinitionNode, OperationTypeNode, parse } from 'graphql';
import { resolve } from 'path';
import stripJsonComments from 'strip-json-comments';
import { ArangoDBAdapter } from '../../src/database/arangodb';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { InMemoryAdapter, InMemoryDB } from '../../src/database/inmemory';
import { IDGenerationInfo, IDGenerator } from '../../src/execution/execution-options';
import { ProjectOptions } from '../../src/project/project';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import {
    createTempDatabase,
    initTestData,
    TEMP_DATABASE_CONFIG,
    TestDataEnvironment,
} from './initialization';
import { ErrorWithCause } from '../../src/utils/error-with-cause';
import { InitTestDataContext } from './init-test-data-context';
import { WarnAndErrorLoggerProvider } from '../helpers/warn-and-error-logger-provider';
import { RequestProfile } from '../../src/config/interfaces';
import { unlinkSync } from 'node:fs';
import deepEqual = require('deep-equal');

interface TestResult {
    readonly actualResult: any;
    readonly expectedResult: any;
}

type DatabaseSpecifier = 'arangodb' | 'in-memory';

export interface RegressionSuiteOptions {
    readonly saveActualAsExpected?: boolean;
    readonly database?: DatabaseSpecifier;
}

interface MetaOptions {
    readonly databases?: {
        readonly [database: string]: {
            readonly ignore?: boolean;
            readonly versions: {
                readonly [version: string]: {
                    readonly ignore?: boolean;
                };
            };
        };
    };
    readonly node?: {
        readonly versions: {
            readonly [version: string]: {
                readonly ignore?: boolean;
            };
        };
    };
}

export interface AqlResult {
    readonly operationName: string;
    readonly expected: string | null;
    readonly actual: string | null;
}

export interface RunTestResult {
    readonly actualResult: unknown;
    readonly expectedResult: unknown;
    readonly aql: ReadonlyArray<AqlResult>;
}

const QUERY_MEMORY_LIMIT_FOR_TESTS = 1_000_000;
const QUERY_MEMORY_LIMIT_FOR_INITIALIZATION = 1_000_000_000;

export class RegressionSuite {
    private schema: GraphQLSchema | undefined;
    private testDataEnvironment: TestDataEnvironment | undefined;
    private _isSetUpClean = false;
    private inMemoryDB: InMemoryDB = new InMemoryDB();
    private databaseSpecifier: DatabaseSpecifier;
    private readonly idGenerator = new PredictableIDGenerator();
    private databaseVersion: string | undefined;
    private nodeVersion: string;
    private lastProfile: RequestProfile | undefined;

    constructor(
        private readonly path: string,
        private options: RegressionSuiteOptions = {},
    ) {
        this.databaseSpecifier = options.database || 'arangodb';
        this.nodeVersion = process.versions.node.split('.')[0];
    }

    private get testsPath() {
        return resolve(this.path, 'tests');
    }

    private async setUp() {
        const optionsPath = resolve(this.path, 'options.json');
        const options = existsSync(optionsPath)
            ? JSON.parse(stripJsonComments(readFileSync(optionsPath, 'utf-8')))
            : {};

        this.idGenerator.resetToPhase('init');
        const generalOptions: ProjectOptions = {
            processError: (e) => {
                console.error(e.stack);
                return e;
            },
            getExecutionOptions: ({ context }) => ({
                authContext: { authRoles: context.authRoles, claims: context.claims },
                flexSearchMaxFilterableAndSortableAmount:
                    context.flexSearchMaxFilterableAndSortableAmount,
                childEntityUpdatesViaDictStrategyThreshold:
                    context.childEntityUpdatesViaDictStrategyThreshold,
                idGenerator: this.idGenerator,
                implicitLimitForRootEntityQueries: context.implicitLimitForRootEntityQueries,
                maxLimitForRootEntityQueries: context.maxLimitForRootEntityQueries,
                queryMemoryLimit: context.queryMemoryLimit,
                recordPlan: true,
            }),
            modelOptions: {
                forbiddenRootEntityNames: [],
            },
            profileConsumer: (profile) => (this.lastProfile = profile),
            ...options,
            getOperationIdentifier: ({ info }) => info.operation,
        };
        const warnLevelOptions = {
            ...generalOptions,
            loggerProvider: new WarnAndErrorLoggerProvider(),
        };
        const debugLevelOptions = {
            ...generalOptions,
            loggerProvider: new Log4jsLoggerProvider(),
        };

        // use a schema that logs less for initTestData and for schema migrations
        // the init db adapter also has a higher query memory limit
        const initProject = await loadProjectFromDir(resolve(this.path, 'model'), warnLevelOptions);
        const initAdapter = await this.createAdapter(warnLevelOptions, { isInitSchema: true });
        const initSchema = initProject.createSchema(initAdapter);
        const initTestDataContext = new InitTestDataContext(initSchema);

        const project = await loadProjectFromDir(resolve(this.path, 'model'), debugLevelOptions);
        const adapter = await this.createAdapter(debugLevelOptions);
        this.schema = project.createSchema(adapter);

        await this.clearDatabase();
        await initAdapter.updateSchema(initProject.getModel());

        const testDataJsonPath = resolve(this.path, 'test-data.json');
        const testDataTsPath = resolve(this.path, 'test-data.ts');
        if (existsSync(testDataJsonPath)) {
            this.testDataEnvironment = await initTestData(
                resolve(this.path, 'test-data.json'),
                initTestDataContext,
            );
        } else if (existsSync(testDataTsPath)) {
            let testDataTsModule;
            try {
                testDataTsModule = await import(testDataTsPath);
            } catch (e) {
                throw new ErrorWithCause(`Error importing ${testDataTsPath}`, e);
            }
            if (!testDataTsModule.default || typeof testDataTsModule.default !== 'function') {
                throw new Error(`${testDataTsPath} does not export a default function`);
            }
            try {
                await testDataTsModule.default(initTestDataContext);
            } catch (e) {
                throw new ErrorWithCause(
                    `Error executing default function from ${testDataTsPath}`,
                    e,
                );
            }

            // identity function here -> test queries can't use @{ids/TypeName/localID}
            // (if we want to support that, we could let the test data function return a mapping)
            this.testDataEnvironment = { fillTemplateStrings: (s) => s };
        } else {
            this.testDataEnvironment = { fillTemplateStrings: (s) => s };
        }

        if (this.databaseSpecifier === 'arangodb') {
            const version = await (initAdapter as ArangoDBAdapter).getArangoDBVersion();
            if (version) {
                this.databaseVersion = `${version.major}.${version.minor}`;
            }
        }

        this._isSetUpClean = true;
    }

    private async clearDatabase() {
        switch (this.databaseSpecifier) {
            case 'in-memory':
                this.inMemoryDB = new InMemoryDB();
                break;
            case 'arangodb':
                await createTempDatabase();
                break;
            default:
                throw new Error(`Unknown database specifier: ${this.databaseSpecifier}`);
        }
    }

    private async createAdapter(
        context: ProjectOptions,
        { isInitSchema = false } = {},
    ): Promise<DatabaseAdapter> {
        switch (this.databaseSpecifier) {
            case 'in-memory':
                return new InMemoryAdapter({ db: this.inMemoryDB }, context);
            case 'arangodb':
                return new ArangoDBAdapter(
                    {
                        ...TEMP_DATABASE_CONFIG,
                        // intentionally set low so we catch issues in tests
                        // but silent schema uses higher limit because it's used in the setup
                        queryMemoryLimit: isInitSchema
                            ? QUERY_MEMORY_LIMIT_FOR_INITIALIZATION
                            : QUERY_MEMORY_LIMIT_FOR_TESTS,
                    },
                    context,
                );
            default:
                throw new Error(`Unknown database specifier: ${this.databaseSpecifier}`);
        }
    }

    getTestNames() {
        return readdirSync(resolve(this.path, 'tests'));
    }

    async shouldIgnoreTest(name: string) {
        if (!this._isSetUpClean) {
            await this.setUp();
        }
        let metaPath = resolve(this.testsPath, name, 'meta.json');
        if (!existsSync(metaPath)) {
            metaPath = resolve(this.path, 'meta.json');
        }
        const meta: MetaOptions | undefined = existsSync(metaPath)
            ? JSON.parse(stripJsonComments(readFileSync(metaPath, 'utf-8')))
            : undefined;
        if (meta && meta.databases && meta.databases[this.databaseSpecifier]) {
            if (meta.databases[this.databaseSpecifier].ignore) {
                return true;
            }
            if (
                this.databaseVersion &&
                meta.databases[this.databaseSpecifier].versions &&
                meta.databases[this.databaseSpecifier].versions[this.databaseVersion] &&
                meta.databases[this.databaseSpecifier].versions[this.databaseVersion].ignore
            ) {
                return true;
            }
        }
        if (meta?.node?.versions[this.nodeVersion]?.ignore) {
            return true;
        }
        return false;
    }

    async runTest(name: string): Promise<RunTestResult> {
        if (!this._isSetUpClean) {
            await this.setUp();
        }
        this.idGenerator.resetToPhase('test');

        if (!this.testDataEnvironment || !this.schema) {
            throw new Error(`Regression suite not set up correctly`);
        }

        const gqlPath = resolve(this.testsPath, name, 'test.graphql');
        const resultPath = resolve(this.testsPath, name, 'result.json');
        const variablesPath = resolve(this.testsPath, name, 'vars.json');
        let contextPath = resolve(this.testsPath, name, 'context.json');
        const metaPath = resolve(this.testsPath, name, 'meta.json');
        if (!existsSync(contextPath)) {
            contextPath = resolve(this.path, 'default-context.json');
        }

        const gqlTemplate = readFileSync(gqlPath, 'utf-8');
        const gqlSource = this.testDataEnvironment.fillTemplateStrings(gqlTemplate);

        const operations = parse(gqlSource).definitions.filter(
            (def) => def.kind == 'OperationDefinition',
        ) as ReadonlyArray<OperationDefinitionNode>;
        this._isSetUpClean =
            this._isSetUpClean && !operations.some((op) => op.operation == 'mutation');

        const expectedResultTemplate = JSON.parse(
            stripJsonComments(readFileSync(resultPath, 'utf-8')),
        );
        const expectedResult = this.testDataEnvironment.fillTemplateStrings(expectedResultTemplate);
        const variableValues = existsSync(variablesPath)
            ? JSON.parse(stripJsonComments(readFileSync(variablesPath, 'utf-8')))
            : {};
        const context = existsSync(contextPath)
            ? JSON.parse(stripJsonComments(readFileSync(contextPath, 'utf-8')))
            : {};
        const meta = existsSync(metaPath)
            ? JSON.parse(stripJsonComments(readFileSync(metaPath, 'utf-8')))
            : {};

        let actualResult: Record<string, unknown> = {};
        let arangoSearchPending = true;
        const aqlResults: AqlResult[] = [];
        const aqlDir = resolve(this.testsPath, name, 'aql');
        let superfluousAqlFiles: Set<string> = new Set();

        if (this.databaseSpecifier === 'arangodb') {
            if (existsSync(aqlDir)) {
                superfluousAqlFiles = new Set(
                    readdirSync(aqlDir)
                        .filter((f) => f.endsWith('.aql'))
                        .map((f) => f.substring(0, f.length - '.aql'.length)),
                );
            }
        }

        for (const operation of operations) {
            const operationName = operation.name?.value;
            if (!operationName) {
                throw new Error(`Anonymous operations are not sppported in regression tests`);
            }

            // we need to wait for arangosearch views to catch up before we can perform a query
            if (
                meta.waitForArangoSearch &&
                this.databaseSpecifier === 'arangodb' &&
                arangoSearchPending &&
                operation.operation === OperationTypeNode.QUERY
            ) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                arangoSearchPending = false;
            }

            let operationContext = context;
            if (context && context.operations && context.operations[operationName]) {
                operationContext = context.operations[operationName];
            }
            this.lastProfile = undefined;
            let operationResult = await graphql({
                schema: this.schema,
                source: gqlSource,
                rootValue: {},
                contextValue: operationContext,
                variableValues,
                operationName,
            });
            operationResult = JSON.parse(JSON.stringify(operationResult)); // serialize e.g. errors as they would be in a GraphQL server
            actualResult[operationName] = operationResult;

            if (this.databaseSpecifier === 'arangodb') {
                // The type of this.lastProfile here is `undefined` because typescript narrows it to
                // that after the assignment to literal undefined. It's set to an actual value
                // during graphql execution -> use type assertions to get correct type
                const profile = this.lastProfile as RequestProfile | undefined;

                const queries = (profile?.plan?.transactionSteps ?? []).map(
                    (s) =>
                        s.query +
                        (typeof s.stats?.peakMemoryUsage === 'number'
                            ? `\n\n// Peak memory usage: ${s.stats.peakMemoryUsage} bytes`
                            : ''),
                );
                const actualAql = queries.length
                    ? formatWhitespaceInFile(
                          queries.join(
                              '\n\n// ----------------------------------------------------------------\n\n',
                          ),
                      )
                    : null;

                const aqlFilePath = resolve(aqlDir, `${operationName}.aql`);

                const expectedAql = existsSync(aqlFilePath)
                    ? readFileSync(aqlFilePath, 'utf-8')
                    : null;

                if (this.options.saveActualAsExpected && actualAql !== expectedAql) {
                    if (actualAql !== null) {
                        mkdirSync(aqlDir, { recursive: true });
                        writeFileSync(aqlFilePath, actualAql, 'utf-8');
                    } else {
                        unlinkSync(aqlFilePath);
                    }
                }

                if (expectedAql !== null) {
                    superfluousAqlFiles.delete(operationName);
                }

                aqlResults.push({
                    operationName,
                    expected: expectedAql,
                    actual: actualAql,
                });
            }

            if (operation.operation === OperationTypeNode.MUTATION) {
                // we need to wait for arangosearch again if we performed a mutation
                arangoSearchPending = true;
            }
        }

        for (const superfluousAqlFile of superfluousAqlFiles) {
            const aqlFilePath = resolve(aqlDir, `${superfluousAqlFile}.aql`);
            aqlResults.push({
                operationName: superfluousAqlFile,
                expected: readFileSync(aqlFilePath, 'utf8'),
                actual: null,
            });

            if (this.options.saveActualAsExpected) {
                unlinkSync(aqlFilePath);
            }
        }

        if (this.options.saveActualAsExpected && !deepEqual(actualResult, expectedResult)) {
            writeFileSync(resultPath, JSON.stringify(actualResult, undefined, '  '), 'utf-8');
        }

        return {
            actualResult,
            expectedResult,
            aql: aqlResults,
        };
    }
}

class PredictableIDGenerator implements IDGenerator {
    nextNumberPerTarget = new Map<string, number>();
    phase = 'init';

    generateID({ target }: IDGenerationInfo): string {
        const number = this.nextNumberPerTarget.get(target) ?? 0;
        this.nextNumberPerTarget.set(target, number + 1);
        return `id_${this.phase}_${String(number).padStart(4, '0')}`;
    }

    resetToPhase(phase: string) {
        // we have separate phases for init and test because we sometimes skip init
        this.phase = phase;
        this.nextNumberPerTarget = new Map();
    }
}

function formatWhitespaceInFile(s: string) {
    if (!s.endsWith('\n')) {
        s += '\n';
    }

    // remove trailing whitespace in lines
    // (editors remove that, so it's hard to keep it in expected files)
    s = s
        .split('\n')
        .map((line) => line.replace(/\s+$/g, ''))
        .join('\n');
    return s;
}
