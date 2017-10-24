import { ArangoDBConfig } from '../../src/database/arangodb/arangodb-adapter';
import { Database } from 'arangojs';
import { graphql, GraphQLSchema } from 'graphql';
import * as fs from 'fs';
import stripJsonComments = require('strip-json-comments');

const DATABASE_NAME = 'momo-test-temp';
const DATABASE_URL = 'http://root:@localhost:8529';

export async function createTempDatabase(): Promise<ArangoDBConfig> {
    const db = new Database({
        url: DATABASE_URL,
    });
    const dbs = await db.listDatabases();
    if (dbs.indexOf(DATABASE_NAME) >= 0) {
        db.useDatabase(DATABASE_NAME);
        const colls = await db.collections(true);
        await Promise.all(colls.map(coll => coll.drop()));
    } else {
        await db.createDatabase(DATABASE_NAME);
    }
    return {
        url: DATABASE_URL,
        databaseName: DATABASE_NAME
    }
}

export async function dropTempDatabase(): Promise<void> {
    const db = new Database({
        url: DATABASE_URL,
    });
    const dbs = await db.listDatabases();
    if (dbs.indexOf(DATABASE_NAME) >= 0) {
        await db.dropDatabase(DATABASE_NAME)
    }
}

export interface TestDataEnvironment {
    fillTemplateStrings: (data: any) => any
}

export async function initTestData(path: string, schema: GraphQLSchema): Promise<TestDataEnvironment> {
    const testData = JSON.parse(stripJsonComments(fs.readFileSync(path, 'utf-8')));
    const ids = new Map<string, string>();

    function fillTemplateStrings(data: any): any {
        if (typeof data == "string") {
            const exprs = [ /@\{ids\/(\w+)\/(\w*)}/g, /@ids\/(\w+)\/(\w*)/g ];
            let result = data;
            for (const expr of exprs) {
                result = result.replace(expr, (_, collection, localID) => {
                    const id = ids.get(collection + '/' + localID);
                    if (id == null) {
                        throw new Error(`ID ${collection}/${localID} was referenced but does not exist`);
                    }
                    return id;
                });
            }
            return result;
        }
        if (data && typeof data == 'object') {
            if (data instanceof Array) {
                return data.map(item => fillTemplateStrings(item));
            }
            for (const key of Object.keys(data)) {
                data[key] = fillTemplateStrings(data[key]);
            }
            return data;
        }
        return data;
    }

    const context = {
        authRoles: testData.roles || []
    };
    for (const rootEntityName in testData.rootEntities) {
        const dataSets = testData.rootEntities[rootEntityName] || [];
        for (let dataSet of dataSets) {
            dataSet = fillTemplateStrings(dataSet);
            const dataID = dataSet['@id'];
            delete dataSet['@id'];
            const query = `mutation($input: Create${rootEntityName}Input!) { res: create${rootEntityName}(input: $input) { id } }`;
            const variables = {input: dataSet};
            const result = await graphql(schema, query, {}, context, variables);
            if (result.errors) {
                throw new Error(`GraphQL error while inserting ${rootEntityName}: ${JSON.stringify(result.errors)}`);
            }
            const id = result.data!.res.id;
            if (!id) {
                throw new Error(`Failed to retrieve ID from query result: ${JSON.stringify(result)}`);
            }
            ids.set(rootEntityName + '/' + dataID, id);
        }
    }

    // not yet implemented
    /*for (const association of model.associations) {
     const dataSets = testData.associations[association.name];
     if (dataSets) {
     for (let dataSet of dataSets) {
     dataSet = fillTemplateStrings(dataSet);
     await exec(`mutation { res: add${association.name}(input: $1) { id }`, { input: dataSet });
     }
     }
     }*/

    return { fillTemplateStrings };
}
