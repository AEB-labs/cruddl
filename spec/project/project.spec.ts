import { expect } from 'chai';
import { graphql } from 'graphql';
import { Logger, LoggerProvider } from '../../src/config/logging';
import { DatabaseAdapter, FlexSearchTokenizable } from '../../src/database/database-adapter';
import { Model } from '../../src/model';
import { Project } from '../../src/project/project';
import { ProjectSource } from '../../src/project/source';
import { QueryNode } from '../../src/query-tree';
import { FlexSearchTokenization } from '../../src/query-tree/flex-search';
import gql from 'graphql-tag';
import { expectSingleError, expectToBeValid } from '../model/implementation/validation-utils';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return { allTests: [{ name: 'Test' }] };
    }

    async updateSchema(model: Model): Promise<void> {}

    async tokenizeExpressions(
        tokenizations: ReadonlyArray<FlexSearchTokenizable>,
    ): Promise<ReadonlyArray<FlexSearchTokenization>> {
        return tokenizations.map((value) => {
            return {
                expression: value.expression,
                analyzer: value.analyzer,
                tokens: value.expression.split('-'),
            };
        });
    }
}

describe('project', () => {
    describe('validate', () => {
        it('accepts a valid simple project', async () => {
            const project = new Project([
                gql`
                    type Test @rootEntity {
                        key: String @key
                    }
                `.loc!.source,
            ]);
            expectToBeValid(project);
        });

        it('accepts a valid project with multiple sources', async () => {
            const project = new Project([
                gql`
                    type Test @rootEntity {
                        key: String @key
                        children: [Child]
                    }
                `.loc!.source,
                gql`
                    # make sure this file is not skipped just because it begins with a comment
                    type Child @childEntity {
                        key: String
                    }
                `.loc!.source,
            ]);
            expectToBeValid(project);
        });

        it('rejects an invalid project with multiple sources', async () => {
            const project = new Project([
                gql`
                    type Test @rootEntity {
                        key: String @key
                        children: [Child]
                    }
                `.loc!.source,
                gql`
                    type OtherChild @childEntity {
                        key: String
                    }
                `.loc!.source,
            ]);
            expectSingleError(project, 'Type "Child" not found.');
        });

        it('accepts a valid project with an additional empty file', async () => {
            const project = new Project([
                gql`
                    type Test @rootEntity {
                        key: String @key
                    }
                `.loc!.source,
                {
                    name: 'other.graphqls',
                    body: '',
                },
            ]);
            expectToBeValid(project);
        });

        it('accepts a valid project with an additional file that only contains comments', async () => {
            const project = new Project([
                gql`
                    type Test @rootEntity {
                        key: String @key
                    }
                `.loc!.source,
                {
                    name: 'other.graphqls',
                    body: '# this is a comment',
                },
            ]);
            expectToBeValid(project);
        });

        it('accepts a project without any source', async () => {
            const project = new Project([]);
            expectToBeValid(project);
        });

        it('accepts a project with just a comment-only source', async () => {
            const project = new Project([
                {
                    name: 'other.graphqls',
                    body: '# this is a comment',
                },
            ]);
            expectToBeValid(project);
        });
    });

    describe('createSchema', () => {
        it('schema resolvers log to logger specified in project', async () => {
            let logs: string[] = [];

            function log(message: string) {
                logs.push(message);
            }

            const loggerProvider: LoggerProvider = {
                getLogger(categoryName: string): Logger {
                    return {
                        debug: log,
                        error: log,
                        warn: log,
                        info: log,
                        fatal: log,
                        trace: log,
                        level: 'trace',
                        isErrorEnabled: () => true,
                        isLevelEnabled: () => true,
                        isDebugEnabled: () => true,
                        isFatalEnabled: () => true,
                        isInfoEnabled: () => true,
                        isTraceEnabled: () => true,
                        isWarnEnabled: () => true,
                    };
                },
            };

            const project = new Project({
                sources: [
                    new ProjectSource(
                        'main.graphqls',
                        `type Test @rootEntity @roles(readWrite: ["admin"]) { name: String }`,
                    ),
                ],
                loggerProvider,
            });
            const dbAdapter = new FakeDBAdatper();
            const execSchema = project.createSchema(dbAdapter);

            logs = [];
            await graphql({
                schema: execSchema,
                source: `
                    {
                        allTests {
                            name
                        }
                    }
                `,
            });
            expect(logs.length).to.be.greaterThan(0);
        });
    });
});
