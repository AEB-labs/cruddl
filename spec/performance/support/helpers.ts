import { Database } from 'arangojs';
import { graphql, GraphQLSchema } from 'graphql';
import * as path from 'path';
import { SchemaContext } from '../../../src/config/global';
import { ArangoDBAdapter } from '../../../src/database/arangodb';
import { Project } from '../../../src/project/project';
import { loadProjectFromDir } from '../../../src/project/project-from-fs';
import { range } from '../../../src/utils/utils';
import { Log4jsLoggerProvider } from '../../helpers/log4js-logger-provider';
import { createTempDatabase } from '../../regression/initialization';

// arangojs typings for this are completely broken
export const aql: (template: TemplateStringsArray, ...args: any[]) => any = require('arangojs').aql;

const MODEL_PATH = path.resolve(__dirname, '../../regression/papers/model');

export interface TestEnvironment {
    getDB(): Database;

    exec(graphql: string, variables?: { [name: string]: any }): any
}

const schemaContext: SchemaContext = { loggerProvider: new Log4jsLoggerProvider('warn'), getExecutionOptions: ({ context }) => ({ authRoles: context.authRoles }) };

export async function createTestProject(modelPath: string = MODEL_PATH): Promise<{ project: Project, schema: GraphQLSchema }> {
    const project = await loadProjectFromDir(modelPath, schemaContext);
    const dbConfig = await createTempDatabase();
    const dbAdapter = new ArangoDBAdapter(dbConfig, schemaContext);
    const schema = project.createSchema(dbAdapter);
    return { project, schema };
}

export async function initEnvironment(): Promise<TestEnvironment> {
    const dbConfig = await createTempDatabase();
    const project = await loadProjectFromDir(MODEL_PATH, schemaContext);
    const dbAdapter = new ArangoDBAdapter(dbConfig, schemaContext);
    const schema = project.createSchema(dbAdapter);
    await dbAdapter.updateSchema(project.getModel());

    return {
        getDB() {
            return new Database(dbConfig).useDatabase(dbConfig.databaseName);
        },
        async exec(gql, variables) {
            const res = await graphql(schema, gql, {} /* root */, { authRoles: ['admin'] }, variables);
            if (res.errors) {
                throw new Error(JSON.stringify(res.errors));
            }
            return res.data;
        }
    };
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
    };
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

export async function addNumberedPapersWithAQL(environment: TestEnvironment, count: number) {
    await environment.getDB().query(aql`FOR i IN 1..${count} INSERT {title: CONCAT("Paper ", i)} IN papers`);
}

export async function getRandomPaperIDsWithAQL(environment: TestEnvironment, count: number): Promise<string[]> {
    const cursor = await environment.getDB().query(aql`FOR node IN papers SORT RAND() LIMIT ${count} RETURN { id: node._key }`);
    const docs = await cursor.all();
    return docs.map((doc: any) => doc.id);
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