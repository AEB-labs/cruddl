import { ArangoDBAdapter } from '../../src/database/arangodb/arangodb-adapter';
import { graphql, GraphQLError, GraphQLSchema, Source } from 'graphql';
import * as fs from 'fs';
import * as path from 'path';
import { createSchema } from '../../src/schema/schema-builder';
import { addQueryResolvers } from '../../src/query/query-resolvers';
import { createTempDatabase, initTestData, TestDataEnvironment } from './initialization';
import * as stripJsonComments from 'strip-json-comments';

interface TestResult {
    actualResult: any
    expectedResult: any
}

export class RegressionSuite {
    private schema: GraphQLSchema;
    private testDataEnvironment: TestDataEnvironment;
    private _isSetUp = false;

    constructor(private readonly path: string) {

    }

    get isSetUp() {
        return this._isSetUp;
    }

    private get testsPath() {
        return path.resolve(this.path, 'tests');
    }

    async setUp() {
        const dbConfig = await createTempDatabase();
        const dbAdapter = new ArangoDBAdapter(dbConfig);
        const model: Array<Source> = fs.readdirSync(path.resolve(this.path, 'model'))
            .map(file => fileToSource(path.resolve(this.path, 'model', file)));
        const dumbSchema = createSchema(model);
        this.schema = addQueryResolvers(dumbSchema, dbAdapter);
        await dbAdapter.updateSchema(this.schema);
        this.testDataEnvironment = await initTestData(path.resolve(this.path, 'test-data.json'), this.schema);
        this._isSetUp = true;
    }

    async initData() {
    }

    getTestNames() {
        return fs.readdirSync(path.resolve(this.path, 'tests'))
            .filter(name => name.endsWith('.graphql'))
            .map(name => name.substr(0, name.length - '.graphql'.length));
    }

    async runTest(name: string) {
        const gqlPath = path.resolve(this.testsPath, name + '.graphql');
        const resultPath = path.resolve(this.testsPath, name + '.result.json');
        const variablesPath = path.resolve(this.testsPath, name + '.vars.json');

        const gqlTemplate = fs.readFileSync(gqlPath, 'utf-8');
        const gqlSource = this.testDataEnvironment.fillTemplateStrings(gqlTemplate);

        const expectedResultTemplate = JSON.parse(stripJsonComments(fs.readFileSync(resultPath, 'utf-8')));
        const expectedResult = this.testDataEnvironment.fillTemplateStrings(expectedResultTemplate);

        const variableValues = fs.existsSync(variablesPath) ? JSON.parse(stripJsonComments(fs.readFileSync(variablesPath, 'utf-8'))) : {};

        const actualResult = await graphql(this.schema, gqlSource, {} /* root */, {}, variableValues);

        return {
            actualResult,
            expectedResult
        };
    }
}

function fileToSource(path: string): Source {
    return new Source(fs.readFileSync(path).toString(), path);
}
