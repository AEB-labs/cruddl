import { Logger, LoggerProvider, SchemaContext } from '../../src/config/global';
import { createSchema } from '../../src/schema/schema-builder';
import { graphql, GraphQLSchema, Source } from 'graphql';
import { QueryNode } from '../../src/query/definition';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { Project } from '../../src/project/project';
import { ProjectSource } from '../../src/project/source';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return { allTests: [{ name: "Test" }] };
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {

    }
}

describe('project', () => {
    describe('createSchema', () => {
        it('schema resolvers log to logger specified in project', async () => {
            let logs: string[] = [];

            function log(message: string) {
                logs.push(message);
            }

            const loggerProvider: LoggerProvider = {
                getLogger(categoryName: string): Logger {
                    return {
                        debug: log, error: log, warn: log, info: log
                    }
                }
            };

            const project = new Project({
                sources: [new ProjectSource('main.graphqls', `type Test @rootEntity @roles(readWrite: ["admin"]) { name: String }`)],
                loggerProvider
            });
            const dbAdapter = new FakeDBAdatper();
            const execSchema = project.createSchema(dbAdapter);

            logs = [];
            const result = await graphql(execSchema, `{ allTests { name } }`, undefined, {authRoles: ['admin']});
            expect(logs.length).toBeGreaterThan(0);
        });
    });
});
