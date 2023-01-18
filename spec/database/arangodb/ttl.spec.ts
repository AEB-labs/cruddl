import gql from 'graphql-tag';
import { Project } from '../../../src/project/project';
import { ProjectSource } from '../../../src/project/source';
import { graphql, GraphQLSchema, print } from 'graphql';
import { ArangoDBAdapter } from '../../../src/database/arangodb';
import { isArangoDBDisabled } from './arangodb-test-utils';
import { createTempDatabase } from '../../regression/initialization';
import { expect } from 'chai';
import { TimeToLiveConfig } from '../../../src/model';

interface Setup {
    readonly schema: GraphQLSchema;
    readonly project: Project;
    readonly adapter: ArangoDBAdapter;

    getAllKeys(): Promise<ReadonlyArray<string>>;
    getN1Keys(): Promise<ReadonlyArray<string>>;
    getN2Keys(): Promise<ReadonlyArray<string>>;
}

interface TestObject {
    readonly key: string;
    readonly finishedAt?: string | null;
    readonly createNested?: ReadonlyArray<TestObject>;
}

async function setUp(data: ReadonlyArray<TestObject>): Promise<Setup> {
    const ttlConfig: TimeToLiveConfig = {
        typeName: 'Test',
        dateField: 'finishedAt',
        expireAfterDays: 3,
    };

    const project = new Project({
        sources: [
            new ProjectSource(
                'source.graphqls',
                print(gql`
                    type Test @rootEntity {
                        key: String
                        finishedAt: DateTime
                        nested: [N1] @relation(onDelete: CASCADE)
                    }

                    type N1 @rootEntity {
                        key: String
                        nested: [N2] @relation(onDelete: RESTRICT)
                        parent: Test @relation(inverseOf: "nested")
                    }

                    type N2 @rootEntity {
                        key: String
                        parent: N1 @relation(inverseOf: "nested")
                    }
                `),
            ),
            new ProjectSource('ttl.json', JSON.stringify({ timeToLive: [ttlConfig] })),
        ],
        getExecutionOptions: () => ({ disableAuthorization: true }),
    });
    const model = project.getModel();

    const dbConfig = await createTempDatabase();
    const adapter = new ArangoDBAdapter(dbConfig);
    await adapter.updateSchema(model);
    const schema = project.createSchema(adapter);

    const initResult = await graphql({
        schema,
        source: print(gql`
            mutation init($data: [CreateTestInput!]!) {
                createTests(input: $data) {
                    key
                }
            }
        `),
        variableValues: {
            data,
        },
    });
    expect(initResult.errors).to.be.undefined;

    return {
        project,
        schema,
        adapter,
        getAllKeys: async () => {
            const result = await graphql({
                schema,
                source: print(gql`
                    {
                        allTests(orderBy: key_ASC) {
                            key
                        }
                    }
                `),
            });
            expect(result.errors).to.be.undefined;
            return (result.data as any).allTests.map((t: TestObject) => t.key) ?? [];
        },
        getN1Keys: async () => {
            const result = await graphql({
                schema,
                source: print(gql`
                    {
                        allN1s(orderBy: key_ASC) {
                            key
                        }
                    }
                `),
            });
            expect(result.errors).to.be.undefined;
            return (result.data as any).allN1s.map((t: any) => t.key) ?? [];
        },
        getN2Keys: async () => {
            const result = await graphql({
                schema,
                source: print(gql`
                    {
                        allN2s(orderBy: key_ASC) {
                            key
                        }
                    }
                `),
            });
            expect(result.errors).to.be.undefined;
            return (result.data as any).allN2s.map((t: any) => t.key) ?? [];
        },
    };
}

describe('ArangoDB TTL', async function () {
    // can't use arrow function because we need the "this"
    if (isArangoDBDisabled()) {
        (this as any).skip();
        return;
    }

    it('deletes expired objects', async () => {
        const { project, adapter, getAllKeys } = await setUp([
            {
                key: '1',
                finishedAt: '2023-01-01T00:00:00Z',
            },
            {
                key: '7',
                finishedAt: '2023-01-07T00:00:00Z',
            },
            {
                key: '8',
                finishedAt: '2023-01-08T00:00:00Z',
            },
            {
                key: '9',
                finishedAt: '2023-01-09T00:00:00Z',
            },
            {
                key: 'N',
                finishedAt: null,
            },
        ]);

        const beforeKeys = await getAllKeys();
        expect(beforeKeys).to.deep.equal(['1', '7', '8', '9', 'N']);

        await project.executeTTLCleanup(adapter, {
            clock: { getCurrentTimestamp: () => '2023-01-10T01:00:00Z' },
            disableAuthorization: true,
        });

        const afterKeys = await getAllKeys();
        expect(afterKeys).to.deep.equal(['8', '9', 'N']);
    });

    it('informs about expired and overdue objects', async function () {
        const { project, adapter, getAllKeys } = await setUp([
            {
                key: '1',
                finishedAt: '2023-01-01T00:00:00Z',
            },
            {
                key: '7',
                finishedAt: '2023-01-07T00:00:00Z',
            },
            {
                key: '8',
                finishedAt: '2023-01-08T00:00:00Z',
            },
            {
                key: '9',
                finishedAt: '2023-01-09T00:00:00Z',
            },
            {
                key: 'N',
                finishedAt: null,
            },
        ]);

        const info = await project.getTTLInfo(adapter, {
            timeToLiveOptions: { overdueDelta: 1 },
            disableAuthorization: true,
            clock: {
                getCurrentTimestamp: () => '2023-01-10T01:00:00Z',
            },
        });

        expect(info).to.deep.equal([
            {
                dateField: 'finishedAt',
                expireAfterDays: 3,
                expiredObjectCount: 2,
                overdueObjectCount: 1,
                typeName: 'Test',
            },
        ]);
    });

    it('respects CASCADE', async () => {
        const { project, adapter, getAllKeys, getN1Keys } = await setUp([
            {
                key: 'K',
                finishedAt: '2023-01-10T00:00:00Z',
                createNested: [{ key: 'K1' }, { key: 'K2' }],
            },
            {
                key: 'D',
                finishedAt: '2023-01-01T00:00:00Z',
                createNested: [{ key: 'D1' }, { key: 'D2' }],
            },
        ]);

        const beforeKeys = await getAllKeys();
        expect(beforeKeys).to.deep.equal(['D', 'K']);
        const beforeN1s = await getN1Keys();
        expect(beforeN1s).to.deep.equal(['D1', 'D2', 'K1', 'K2']);

        await project.executeTTLCleanup(adapter, {
            clock: { getCurrentTimestamp: () => '2023-01-10T01:00:00Z' },
            disableAuthorization: true,
        });

        const afterKeys = await getAllKeys();
        expect(afterKeys).to.deep.equal(['K']);
        const afterN1s = await getN1Keys();
        expect(afterN1s).to.deep.equal(['K1', 'K2']);
    });

    it('respects RESTRICT', async () => {
        const { project, adapter, getAllKeys, getN2Keys } = await setUp([
            {
                key: 'K',
                finishedAt: '2023-01-10T00:00:00Z',
                createNested: [
                    {
                        key: 'K1',
                        createNested: [
                            {
                                key: 'K11',
                            },
                        ],
                    },
                    { key: 'K2' },
                ],
            },
            {
                key: 'D',
                finishedAt: '2023-01-01T00:00:00Z',
                createNested: [
                    {
                        key: 'D1',
                        createNested: [
                            {
                                key: 'D11',
                            },
                        ],
                    },
                    { key: 'D2' },
                ],
            },
            {
                key: 'R',
                finishedAt: '2023-01-01T00:00:00Z',
                createNested: [
                    {
                        key: 'R1',
                        createNested: [
                            {
                                key: 'R11',
                            },
                        ],
                    },
                    { key: 'R2' },
                ],
            },
        ]);

        const beforeKeys = await getAllKeys();
        expect(beforeKeys).to.deep.equal(['D', 'K', 'R']);
        const beforeN2s = await getN2Keys();
        expect(beforeN2s).to.deep.equal(['D11', 'K11', 'R11']);

        const ttlPromise = project.executeTTLCleanup(adapter, {
            clock: { getCurrentTimestamp: () => '2023-01-10T01:00:00Z' },
            disableAuthorization: true,
        });
        await expect(ttlPromise).to.be.rejectedWith(
            /Cannot delete Test object because 2 N2 objects are still referenced via nested.nested.*/,
        );

        // ideally, this should delete D but keep R
        // this is not supported currently; instead, the whole TTL batch fails
        // this test exists to document the status quo and can be converted to test the correct
        // behavior by uncommenting the expects below.

        /*const afterKeys = await getAllKeys();
        expect(afterKeys).to.deep.equal(['K', 'R']);
        const afterN2s = await getN2Keys();
        expect(afterN2s).to.deep.equal(['K11', 'R11']);*/
    });
});
