import { Logger, SchemaContext } from '../../src/config/global';
import { createSchema } from '../../src/schema/schema-builder';
import { graphql, GraphQLSchema, Source } from 'graphql';
import { addQueryResolvers } from '../../src/query/query-resolvers';
import { QueryNode } from '../../src/query/definition';
import { DatabaseAdapter } from '../../src/database/database-adapter';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return { allTests: [{ name: "Test" }] };
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {

    }
}

describe('query-resolvers', () => {
    it('logs to logger specified in schemaContext', async () => {
        let logs: string[] = [];
        function log(message: string) {
            logs.push(message);
        }
        const schemaContext: SchemaContext =  {
            loggerProvider: {
                getLogger(categoryName: string): Logger {
                    return {
                        debug: log, error: log, warn: log, info: log
                    }
                }
            }
        };

        const schema = createSchema({
            schemaParts: [{
                source: new Source(`type Test @rootEntity @roles(readWrite: ["admin"]) { name: String }`)
            }]
        }, schemaContext);
        const dbAdapter = new FakeDBAdatper();
        const execSchema = await addQueryResolvers(schema, dbAdapter, schemaContext);

        logs = [];
        const result = await graphql(execSchema, `{ allTests { name } }`, undefined, { authRoles: ['admin']});
        expect(logs.length).toBeGreaterThan(0);
    });
});
