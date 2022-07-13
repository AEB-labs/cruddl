import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { graphql, GraphQLSchema, OperationDefinitionNode, parse } from 'graphql';
import { resolve } from 'path';
import stripJsonComments from 'strip-json-comments';
import { ArangoDBAdapter } from '../../src/database/arangodb';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { InMemoryAdapter, InMemoryDB } from '../../src/database/inmemory';
import { ProjectOptions } from '../../src/project/project';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import { createTempDatabase, initTestData, TestDataEnvironment } from './initialization';
import deepEqual = require('deep-equal');

interface TestResult {
    readonly actualResult: any;
    readonly expectedResult: any;
}

type DatabaseSpecifier = 'arangodb' | 'in-memory';

export interface RegressionSuiteOptions {
    readonly saveActualAsExpected?: boolean;
    readonly trace?: boolean;
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
}

export class RegressionSuite {
    private schema: GraphQLSchema | undefined;
    private testDataEnvironment: TestDataEnvironment | undefined;
    private _isSetUpClean = false;
    // TODO: this is ugly but provides a quick fix for things broken with the silentAdapter
    // TODO: implement better regression test architecture for different db types
    private inMemoryDB: InMemoryDB = new InMemoryDB();
    private databaseSpecifier: DatabaseSpecifier;
    private databaseVersion: string | undefined;

    constructor(private readonly path: string, private options: RegressionSuiteOptions = {}) {
        this.databaseSpecifier = options.database || 'arangodb';
    }

    private get testsPath() {
        return resolve(this.path, 'tests');
    }

    private async setUp() {
        const optionsPath = resolve(this.path, 'options.json');
        const options = existsSync(optionsPath)
            ? JSON.parse(stripJsonComments(readFileSync(optionsPath, 'utf-8')))
            : {};

        this.inMemoryDB = new InMemoryDB();
        const generalOptions: ProjectOptions = {
            processError: (e) => {
                console.error(e.stack);
                return e;
            },
            getExecutionOptions: ({ context }) => ({
                authContext: { authRoles: context.authRoles, claims: context.claims },
                flexSearchMaxFilterableAndSortableAmount:
                    context.flexSearchMaxFilterableAndSortableAmount,
            }),
            modelOptions: {
                forbiddenRootEntityNames: [],
            },
            ...options,
            getOperationIdentifier: ({ info }) => info.operation,
        };
        const warnLevelOptions = {
            ...generalOptions,
            loggerProvider: new Log4jsLoggerProvider('warn'),
        };
        const debugLevelOptions = {
            ...generalOptions,
            loggerProvider: new Log4jsLoggerProvider(this.options.trace ? 'trace' : 'warn', {
                'schema-builder': 'warn',
            }),
        };

        // use a schema that logs less for initTestData and for schema migrations
        const silentProject = await loadProjectFromDir(
            resolve(this.path, 'model'),
            warnLevelOptions,
        );
        const silentAdapter = await this.createAdapter(warnLevelOptions);
        const silentSchema = silentProject.createSchema(silentAdapter);

        const project = await loadProjectFromDir(resolve(this.path, 'model'), debugLevelOptions);
        const adapter = await this.createAdapter(debugLevelOptions);
        this.schema = project.createSchema(adapter);

        await silentAdapter.updateSchema(silentProject.getModel());
        this.testDataEnvironment = await initTestData(
            resolve(this.path, 'test-data.json'),
            silentSchema,
        );

        if (this.databaseSpecifier === 'arangodb') {
            const version = await (adapter as ArangoDBAdapter).getArangoDBVersion();
            if (version) {
                this.databaseVersion = `${version.major}.${version.minor}`;
            }
        }

        this._isSetUpClean = true;
    }

    private async createAdapter(context: ProjectOptions): Promise<DatabaseAdapter> {
        switch (this.databaseSpecifier) {
            case 'in-memory':
                return new InMemoryAdapter({ db: this.inMemoryDB }, context);
            case 'arangodb':
                const dbConfig = await createTempDatabase();
                return new ArangoDBAdapter(dbConfig, context);
            default:
                throw new Error(`Unknown database specifier: ${this.databaseSpecifier}`);
        }
    }

    getTestNames() {
        return readdirSync(resolve(this.path, 'tests'))
            .filter((name) => name.endsWith('.graphql'))
            .map((name) => name.substring(0, name.length - '.graphql'.length));
    }

    async shouldIgnoreTest(name: string) {
        if (!this._isSetUpClean) {
            await this.setUp();
        }
        const metaPath = resolve(this.testsPath, name + '.meta.json');
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
        return false;
    }

    async runTest(name: string) {
        if (!this._isSetUpClean) {
            await this.setUp();
        }

        if (!this.testDataEnvironment || !this.schema) {
            throw new Error(`Regression suite not set up correctly`);
        }

        const gqlPath = resolve(this.testsPath, name + '.graphql');
        const resultPath = resolve(this.testsPath, name + '.result.json');
        const variablesPath = resolve(this.testsPath, name + '.vars.json');
        let contextPath = resolve(this.testsPath, name + '.context.json');
        const metaPath = resolve(this.testsPath, name + '.meta.json');
        if (!existsSync(contextPath)) {
            contextPath = resolve(this.path, 'default-context.json');
        }

        const gqlTemplate = readFileSync(gqlPath, 'utf-8');
        const gqlSource = this.testDataEnvironment.fillTemplateStrings(gqlTemplate);

        const operations = parse(gqlSource).definitions.filter(
            (def) => def.kind == 'OperationDefinition',
        ) as OperationDefinitionNode[];
        this._isSetUpClean =
            this._isSetUpClean && !operations.some((op) => op.operation == 'mutation');
        const hasNamedOperations = operations.length && operations[0].name;

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

        if (meta.waitForArangoSearch && this.databaseSpecifier === 'arangodb') {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        let actualResult: any;
        if (hasNamedOperations) {
            const operationNames = operations.map((def) => def.name!.value);
            actualResult = {};
            for (const operationName of operationNames) {
                let operationContext = context;
                if (context && context.operations && context.operations[operationName]) {
                    operationContext = context.operations[operationName];
                }
                let operationResult = await graphql(
                    this.schema,
                    gqlSource,
                    {} /* root */,
                    operationContext,
                    variableValues,
                    operationName,
                );
                operationResult = JSON.parse(JSON.stringify(operationResult)); // serialize e.g. errors as they would be in a GraphQL server
                actualResult[operationName] = operationResult;
            }
        } else {
            actualResult = await graphql(
                this.schema,
                gqlSource,
                {} /* root */,
                context,
                variableValues,
            );
            actualResult = JSON.parse(JSON.stringify(actualResult)); // serialize e.g. errors as they would be in a GraphQL server
        }

        if (this.options.saveActualAsExpected && !deepEqual(actualResult, expectedResult)) {
            writeFileSync(resultPath, JSON.stringify(actualResult, undefined, '  '), 'utf-8');
        }

        return {
            actualResult,
            expectedResult,
        };
    }
}
