import * as fs from 'fs';
import { graphql, GraphQLSchema, OperationDefinitionNode, parse } from 'graphql';
import * as path from 'path';
import * as stripJsonComments from 'strip-json-comments';
import { SchemaContext } from '../../src/config/global';
import { ArangoDBAdapter } from '../../src/database/arangodb';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { InMemoryAdapter, InMemoryDB } from '../../src/database/inmemory';
import { ProjectOptions } from '../../src/project/project';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import { createTempDatabase, initTestData, TestDataEnvironment } from './initialization';
import deepEqual = require('deep-equal');

interface TestResult {
    actualResult: any
    expectedResult: any
}

export interface RegressionSuiteOptions {
    saveActualAsExpected?: boolean
    trace?: boolean
    database?: 'arangodb' | 'in-memory';
}

export class RegressionSuite {
    private schema: GraphQLSchema | undefined;
    private testDataEnvironment: TestDataEnvironment | undefined;
    private _isSetUpClean = false;
    // TODO: this is ugly but provides a quick fix for things broken with the silentAdapter
    // TODO: implement better regression test architecture for different db types
    private inMemoryDB: InMemoryDB = new InMemoryDB();

    constructor(private readonly path: string, private options: RegressionSuiteOptions = {}) {

    }

    private get testsPath() {
        return path.resolve(this.path, 'tests');
    }

    private async setUp() {
        this.inMemoryDB = new InMemoryDB();
        const generalOptions: ProjectOptions = {
            getExecutionOptions: ({ context }) => ({ authRoles: context.authRoles })
        };
        const warnLevelOptions = { ...generalOptions, loggerProvider: new Log4jsLoggerProvider('warn') };
        const debugLevelOptions = { ...generalOptions, loggerProvider: new Log4jsLoggerProvider(this.options.trace ? 'trace' : 'warn', { 'schema-builder': 'warn' }) };

        // use a schema that logs less for initTestData and for schema migrations
        const silentProject = await loadProjectFromDir(path.resolve(this.path, 'model'), warnLevelOptions);
        const silentAdapter = await this.createAdapter(warnLevelOptions);
        const silentSchema = silentProject.createSchema(silentAdapter);

        const project = await loadProjectFromDir(path.resolve(this.path, 'model'), debugLevelOptions);
        const adapter = await this.createAdapter(debugLevelOptions);
        this.schema = project.createSchema(adapter);

        await silentAdapter.updateSchema(silentProject.getModel());
        this.testDataEnvironment = await initTestData(path.resolve(this.path, 'test-data.json'), silentSchema);

        this._isSetUpClean = true;
    }

    private async createAdapter(context: SchemaContext): Promise<DatabaseAdapter> {
        // TODO this is ugly
        if (this.options.database == 'in-memory') {
            return new InMemoryAdapter({ db: this.inMemoryDB }, context);
        } else {
            const dbConfig = await createTempDatabase();
            return new ArangoDBAdapter(dbConfig, context);
        }
    }

    getTestNames() {
        return fs.readdirSync(path.resolve(this.path, 'tests'))
            .filter(name => name.endsWith('.graphql'))
            .map(name => name.substr(0, name.length - '.graphql'.length));
    }

    async runTest(name: string) {
        if (!this._isSetUpClean) {
            await this.setUp();
        }

        if (!this.testDataEnvironment || !this.schema) {
            throw new Error(`Regression suite not set up correctly`);
        }

        const gqlPath = path.resolve(this.testsPath, name + '.graphql');
        const resultPath = path.resolve(this.testsPath, name + '.result.json');
        const variablesPath = path.resolve(this.testsPath, name + '.vars.json');
        let contextPath = path.resolve(this.testsPath, name + '.context.json');
        if (!fs.existsSync(contextPath)) {
            contextPath = path.resolve(this.path, 'default-context.json');
        }


        const gqlTemplate = fs.readFileSync(gqlPath, 'utf-8');
        const gqlSource = this.testDataEnvironment.fillTemplateStrings(gqlTemplate);

        const operations = parse(gqlSource).definitions
            .filter(def => def.kind == 'OperationDefinition') as OperationDefinitionNode[];
        this._isSetUpClean = this._isSetUpClean && !operations.some(op => op.operation == 'mutation');
        const hasNamedOperations = operations.length && operations[0].name;

        const expectedResultTemplate = JSON.parse(stripJsonComments(fs.readFileSync(resultPath, 'utf-8')));
        const expectedResult = this.testDataEnvironment.fillTemplateStrings(expectedResultTemplate);
        const variableValues = fs.existsSync(variablesPath) ? JSON.parse(stripJsonComments(fs.readFileSync(variablesPath, 'utf-8'))) : {};
        const context = fs.existsSync(contextPath) ? JSON.parse(stripJsonComments(fs.readFileSync(contextPath, 'utf-8'))) : {};

        let actualResult: any;
        if (hasNamedOperations) {
            const operationNames = operations.map(def => def.name!.value);
            actualResult = {};
            for (const operationName of operationNames) {
                let operationResult = await graphql(this.schema, gqlSource, {} /* root */, context, variableValues, operationName);
                operationResult = JSON.parse(JSON.stringify(operationResult)); // serialize e.g. errors as they would be in a GraphQL server
                actualResult[operationName] = operationResult;
            }
        } else {
            actualResult = await graphql(this.schema, gqlSource, {} /* root */, context, variableValues);
            actualResult = JSON.parse(JSON.stringify(actualResult)); // serialize e.g. errors as they would be in a GraphQL server
        }

        if (this.options.saveActualAsExpected && !deepEqual(actualResult, expectedResult)) {
            fs.writeFileSync(resultPath, JSON.stringify(actualResult, undefined, '  '), 'utf-8');
        }

        return {
            actualResult,
            expectedResult
        };
    }
}
