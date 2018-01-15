import { ArangoDBAdapter, ArangoDBConfig } from '../../src/database/arangodb/arangodb-adapter';
import {
    graphql, GraphQLError, GraphQLSchema, OperationDefinitionNode, parse, separateOperations, Source
} from 'graphql';
import * as fs from 'fs';
import * as path from 'path';
import { createSchema } from '../../src/schema/schema-builder';
import { addQueryResolvers } from '../../src/query/query-resolvers';
import { createTempDatabase, initTestData, TestDataEnvironment } from './initialization';
import * as stripJsonComments from 'strip-json-comments';
import { PlainObject } from '../../src/utils/utils';
import {SchemaConfig, SchemaPartConfig} from "../../src/config/schema-config";
import { Log4jsLoggerProvider } from '../helpers/log4js-logger-provider';
import { SchemaContext } from '../../src/config/global';

interface TestResult {
    actualResult: any
    expectedResult: any
}

export interface RegressionSuiteOptions {
    saveActualAsExpected?: boolean
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
        const warnLevelContext = { loggerProvider: new Log4jsLoggerProvider('warn') };
        const debugLevelContext = { loggerProvider: new Log4jsLoggerProvider('debug') };

        const dbConfig = await createTempDatabase();

        const permissionProfilesPath = path.resolve(this.path, 'model/permission-profiles.json');
        const schemaConfig: SchemaConfig = {
            schemaParts: fs.readdirSync(path.resolve(this.path, 'model'))
                .filter(file => file.endsWith('.graphqls'))
                .map(file => fileToSchemaPartConfig(path.resolve(this.path, 'model', file))),
            permissionProfiles: fs.existsSync(permissionProfilesPath) ? JSON.parse(fs.readFileSync(permissionProfilesPath, 'utf-8')) : undefined
        };

        this.schema = this.createSchema(dbConfig, schemaConfig, debugLevelContext);

        // use a schema that logs less for initTestData
        const initDataSchema = this.createSchema(dbConfig, schemaConfig, warnLevelContext);
        await new ArangoDBAdapter(dbConfig, warnLevelContext).updateSchema(this.schema);
        this.testDataEnvironment = await initTestData(path.resolve(this.path, 'test-data.json'), initDataSchema);

        this._isSetUpClean = true;
    }

    private createSchema(dbConfig: ArangoDBConfig, schemaConfig: SchemaConfig, context: SchemaContext) {
        const dbAdapter = new ArangoDBAdapter(dbConfig, context);
        // we never want debug output of createSchema() in regression tests
        const dumbSchema = createSchema(schemaConfig, { loggerProvider: new Log4jsLoggerProvider('warn') });
        return addQueryResolvers(dumbSchema, dbAdapter, context);
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

        if (this.options.saveActualAsExpected && !(jasmine as any).matchersUtil.equals(actualResult, expectedResult)) {
            fs.writeFileSync(resultPath, JSON.stringify(actualResult, undefined, '  '), 'utf-8');
        }

        return {
            actualResult,
            expectedResult
        };
    }
}

function fileToSchemaPartConfig(path: string): SchemaPartConfig {
    return { source: new Source(fs.readFileSync(path).toString(), path) };
}
