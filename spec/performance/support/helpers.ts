import { createTempDatabase, initTestData } from '../../regression/initialization';
import {Database} from "arangojs";
import {range} from "../../../src/utils/utils";
import { ArangoDBAdapter } from '../../../src/database/arangodb/arangodb-adapter';
import { graphql, GraphQLSchema, Source } from 'graphql';
import * as fs from 'fs';
import * as path from 'path';
import { createSchema } from '../../../src/schema/schema-builder';
import { addQueryResolvers } from '../../../src/query/query-resolvers';

// arangojs typings for this are completely broken
export const aql: (template: TemplateStringsArray, ...args: any[]) => any = require('arangojs').aql;

const MODEL_PATH = path.resolve(__dirname, '../../regression/papers/model');

export interface TestEnvironment {
    getDB(): Database;
    exec(graphql: string, variables?: {[name: string]: any}): any
}

export function createDumbSchema(modelPath: string): GraphQLSchema {
    const model: Array<Source> = fs.readdirSync(modelPath)
        .map(file => fileToSource(path.resolve(modelPath, file)));
    return createSchema(model);
}

export async function initEnvironment(): Promise<TestEnvironment> {
    const dbConfig = await createTempDatabase();
    const dbAdapter = new ArangoDBAdapter(dbConfig);
    const schema = addQueryResolvers(createDumbSchema(MODEL_PATH), dbAdapter);
    await dbAdapter.updateSchema(schema);

    return {
        getDB() {
            return new Database(dbConfig)
        },
        async exec(gql, variables) {
            const res = await graphql(schema, gql, {} /* root */, {}, variables);
            if (res.errors) {
                throw new Error(JSON.stringify(res.errors));
            }
            return res.data;
        }
    };
}

function fileToSource(path: string): Source {
    return new Source(fs.readFileSync(path).toString(), path);
}

function createLiteratureReference(sizeFactor: number) {
    return {
        title: 'A referenced paper',
        authors: range(sizeFactor).map(index => `Author ${index}`),
        pages: {
            startPage: 5,
            endPage: 10
        }
    };
}

export function createLargePaper(sizeFactor: number): any {
    const sizeSqrt = Math.round(Math.sqrt(sizeFactor));
    return {
        title: 'A paper',
        literatureReferences: range(sizeSqrt).map(() => createLiteratureReference(sizeSqrt)),
        tags: range(sizeFactor).map(index => `Tag ${index}`)
    }
}

export function createUser() {
    return {
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max.mustermann@example.com'
    };
}

export function getSizeFactorForJSONLength(jsonLength: number) {
    const sizeFactorPerLength = 100 / JSON.stringify(createLargePaper(100)).length;
    return Math.ceil(sizeFactorPerLength * jsonLength);
}

export async function addPaper(environment: TestEnvironment, paperData: any): Promise<number> {
    const res = await environment.exec(`mutation($input: CreatePaperInput!) { createPaper(input: $input) { id } }`, {
        input: paperData
    });
    return res.createPaper.id;
}

export async function addManyPapersWithAQL(environment: TestEnvironment, count: number, paperData: any) {
    await environment.getDB().query(aql`FOR i IN 1..${count} INSERT ${paperData} IN papers`);
}

export async function addManyUsersWithAQL(environment: TestEnvironment, count: number, userData: any) {
    await environment.getDB().query(aql`FOR i IN 1..${count} INSERT ${userData} IN users`);
}

export async function getRandomPaperIDsWithAQL(environment: TestEnvironment, count: number): Promise<number[]> {
    const cursor = await environment.getDB().query(aql`FOR node IN papers SORT RAND() LIMIT ${count} RETURN { id: node._key }`);
    const docs = await cursor.all();
    return docs.map(doc => doc.id);
}

export function formatBytes(bytes: number): string {
    if (bytes < 1000) {
        return `${bytes} bytes`;
    }
    const kb = bytes / 1000;
    if (kb < 1000) {
        return `${kb} KB`;
    }
    const mb = kb / 1000;
    if (mb < 1000) {
        return `${mb} MB`;
    }
    const gb = mb / 1000;
    return `${gb} GB`;
}