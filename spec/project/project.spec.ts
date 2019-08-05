import { expect } from 'chai';
import { graphql } from 'graphql';
import { Logger, LoggerProvider } from '../../src/config/logging';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { FlexSearchLanguage, Model } from '../../src/model';
import { Project } from '../../src/project/project';
import { ProjectSource } from '../../src/project/source';
import { QueryNode } from '../../src/query-tree';
import { FlexSearchTokenization } from '../../src/query-tree/flex-search';
import { createSchema } from '../../src/schema/schema-builder';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return { allTests: [{ name: 'Test' }] };
    }

    async updateSchema(model: Model): Promise<void> {

    }

    async tokenizeExpressions(tokenizations: ReadonlyArray<[string, FlexSearchLanguage]>): Promise<ReadonlyArray<FlexSearchTokenization>> {
        return tokenizations.map(value => {
            return {
                expression: value[0],
                language: value[1],
                tokens: value[0].split('-')
            };

        });
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
                        debug: log, error: log, warn: log, info: log, fatal: log, trace: log,
                        level: 'trace',
                        isErrorEnabled: () => true,
                        isLevelEnabled: () => true,
                        isDebugEnabled: () => true,
                        isFatalEnabled: () => true,
                        isInfoEnabled: () => true,
                        isTraceEnabled: () => true,
                        isWarnEnabled: () => true
                    };
                }
            };

            const project = new Project({
                sources: [new ProjectSource('main.graphqls', `type Test @rootEntity @roles(readWrite: ["admin"]) { name: String }`)],
                loggerProvider
            });
            const dbAdapter = new FakeDBAdatper();
            const execSchema = project.createSchema(dbAdapter);

            logs = [];
            const result = await graphql(execSchema, `{ allTests { name } }`, undefined, { authRoles: ['admin'] });
            expect(logs.length).to.be.greaterThan(0);
        });
    });
});
