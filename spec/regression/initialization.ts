import { Database } from 'arangojs';
import { Collection } from 'arangojs/collection';
import { existsSync, readFileSync } from 'fs';
import { ExecutionResult, graphql, GraphQLSchema } from 'graphql';
import stripJsonComments from 'strip-json-comments';
import { ArangoDBConfig } from '../../src/database/arangodb';

const DATABASE_NAME = 'cruddl-test-temp';
const DATABASE_URL = 'http://root:@localhost:8529';

export async function createTempDatabase(): Promise<ArangoDBConfig> {
    const systemDatabase = new Database({
        url: DATABASE_URL,
    });
    const dbs = await systemDatabase.listDatabases();
    if (dbs.indexOf(DATABASE_NAME) >= 0) {
        const db = systemDatabase.database(DATABASE_NAME);
        const colls = (await db.collections(true)) as Collection[];
        await Promise.all(colls.map((coll) => coll.drop()));
    } else {
        await systemDatabase.createDatabase(DATABASE_NAME);
    }
    return {
        url: DATABASE_URL,
        databaseName: DATABASE_NAME,
    };
}

export async function dropTempDatabase(): Promise<void> {
    const db = new Database({
        url: DATABASE_URL,
    });
    const dbs = await db.listDatabases();
    if (dbs.indexOf(DATABASE_NAME) >= 0) {
        await db.dropDatabase(DATABASE_NAME);
    }
}

export function getTempDatabase(): Database {
    return new Database({
        url: DATABASE_URL,
        databaseName: DATABASE_NAME,
    });
}

export interface TestDataEnvironment {
    fillTemplateStrings: (data: any) => any;
}

export async function initTestData(
    path: string,
    schema: GraphQLSchema,
): Promise<TestDataEnvironment> {
    if (!existsSync(path)) {
        return {
            fillTemplateStrings: (a) => a,
        };
    }

    const testData = JSON.parse(stripJsonComments(readFileSync(path, 'utf-8')));
    const ids = new Map<string, string>();

    function fillTemplateStrings(data: any): any {
        if (typeof data == 'string') {
            const exprs = [/@\{ids\/([\w\.]+)\/(\w*)}/g, /@ids\/([\w\.]+)\/(\w*)/g];
            let result = data;
            for (const expr of exprs) {
                result = result.replace(expr, (_, collection, localID) => {
                    const id = ids.get(collection + '/' + localID);
                    if (id == null) {
                        throw new Error(
                            `ID ${collection}/${localID} was referenced but does not exist`,
                        );
                    }
                    return id;
                });
            }
            return result;
        }
        if (data && typeof data == 'object') {
            if (data instanceof Array) {
                return data.map((item) => fillTemplateStrings(item));
            }
            for (const key of Object.keys(data)) {
                data[key] = fillTemplateStrings(data[key]);
            }
            return data;
        }
        return data;
    }

    const context = {
        authRoles: testData.roles || [],
    };
    for (const rootEntityName in testData.rootEntities) {
        const namespace = rootEntityName.split('.');
        const rootEntityLocalName = namespace.pop();
        const dataSets = testData.rootEntities[rootEntityName] || [];
        for (let dataSet of dataSets) {
            dataSet = fillTemplateStrings(dataSet);
            const dataID = dataSet['@id'];
            delete dataSet['@id'];
            const query = `mutation($input: Create${rootEntityLocalName}Input!) { ${wrapNamespaceForQuery(
                `res: create${rootEntityLocalName}(input: $input) { id }`,
                namespace,
            )} }`;
            const variables = { input: dataSet };
            const result = await graphql(schema, query, {}, context, variables);
            if (result.errors) {
                throw new Error(
                    `GraphQL error while inserting ${rootEntityName}: ${JSON.stringify(
                        result.errors,
                    )}`,
                );
            }
            const id = retrieveIdFromResult(result, namespace);
            if (!id) {
                throw new Error(
                    `Failed to retrieve ID from query result: ${JSON.stringify(result)}`,
                );
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

function wrapNamespaceForQuery(stuff: string, namespace: string[]) {
    if (!namespace) {
        return stuff;
    }
    let result = stuff;
    for (const namespacePart of [...namespace].reverse()) {
        result = `${namespacePart} { ${result} }`;
    }
    return result;
}

function retrieveIdFromResult(result: ExecutionResult, namespace: string[]) {
    const ns = [...namespace];
    let node = result.data!;
    while (ns.length) {
        const nextNode = node[ns.shift()!];
        if (!nextNode) {
            // Not available in result due to missing namespace, e. g. because of auth errors.
            return undefined;
        }
        node = nextNode;
    }
    return node.res.id;
}
