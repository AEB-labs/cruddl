import { ArangoDBAdapter } from '../../src/database/arangodb';
import { graphql, GraphQLSchema, OperationDefinitionNode, parse } from 'graphql';
import * as path from 'path';
import * as fs from 'fs';
import { createTempDatabase, initTestData, TestDataEnvironment } from './initialization';
import * as stripJsonComments from 'strip-json-comments';
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import { loadProjectFromDir } from '../../src/project/project-from-fs';
import { ProjectOptions } from '../../src/project/project';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { SchemaContext } from '../../src/config/global';
import { InMemoryAdapter, InMemoryDB } from '../../src/database/inmemory';
import deepEqual = require('deep-equal');

interface TestResult {
    actualResult: any
    expectedResult: any
}

export interface RegressionSuiteOptions {
    saveActualAsExpected?: boolean
    database?: 'arangodb'|'in-memory';
}

export class RegressionSuite {
    private schema: GraphQLSchema;
    private testDataEnvironment: TestDataEnvironment;
    private _isSetUpClean = false;

    constructor(private readonly path: string, private options: RegressionSuiteOptions = {}) {

    }

    private get testsPath() {
        return path.resolve(this.path, 'tests');
    }

    private async setUp() {
        const warnLevelOptions = { loggerProvider: new Log4jsLoggerProvider('warn') };
        const debugLevelOptions = { loggerProvider: new Log4jsLoggerProvider('debug', { 'schema-builder': 'warn'}) };

        const factory = await this.createAdapterFactory();
        this.schema = await this.createSchema(factory, debugLevelOptions);

        // use a schema that logs less for initTestData
        const initDataSchema = await this.createSchema(factory, warnLevelOptions);
        const initDataAdapter = factory(warnLevelOptions);
        await initDataAdapter.updateSchema(initDataSchema);
        this.testDataEnvironment = await initTestData(path.resolve(this.path, 'test-data.json'), initDataSchema);

        this._isSetUpClean = true;
    }

    private async createAdapterFactory(): Promise<(context: SchemaContext) => DatabaseAdapter> {
        // TODO this is ugly
        if (this.options.database == 'in-memory') {
            const db = new InMemoryDB();
            return (context: SchemaContext) => new InMemoryAdapter({ db }, context);
        } else {
            const dbConfig = await createTempDatabase();
            return (context: SchemaContext) => new ArangoDBAdapter(dbConfig, context);
        }
    }

    private async createSchema(factory: (context: SchemaContext) => DatabaseAdapter, options: ProjectOptions) {
        const dbAdapter = factory(options);
        const project = await loadProjectFromDir(path.resolve(this.path, 'model'), options);
        return project.createSchema(dbAdapter);
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
