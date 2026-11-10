import { graphql } from 'graphql';
import { gql } from 'graphql-tag';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RequestProfile } from '../core/config/interfaces.js';
import type { ExecutionOptions } from '../core/execution/execution-options.js';
import type { SchemaExecutor } from '../core/execution/schema-executor.js';
import { Project } from '../core/project/project.js';
import { ProjectSource } from '../core/project/source.js';
import { InMemoryAdapter } from '../inmemory/inmemory-adapter.js';
import { createTempDatabase } from '../testing/regression-tests/initialization.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import { isArangoDBDisabled } from './testing/is-arangodb-disabled.js';

const source = `
    type Delivery @rootEntity @roles(readWrite: "allusers") {
        deliveryNumber: String @key
        itemCount: Int
    }
`;

describe.skipIf(isArangoDBDisabled())('ArangoDBAdapter execution plans', () => {
    let project: Project;
    let adapter: ArangoDBAdapter;
    let executor: SchemaExecutor;

    beforeEach(async () => {
        project = new Project({
            sources: [new ProjectSource('schema.graphql', source)],
        });
        adapter = new ArangoDBAdapter(await createTempDatabase());
        await adapter.updateSchema(project.getModel());
        executor = project.createSchemaExecutor(adapter);
    });

    async function execute(document: string, options: ExecutionOptions = {}) {
        const result = await executor.tryExecute({
            document: gql(document),
            options: { authContext: { authRoles: ['allusers'] }, ...options },
        });
        if (!result) {
            throw new Error(`Expected the operation to be executable`);
        }
        return result;
    }

    async function getDeliveryNumbers(): Promise<ReadonlyArray<string>> {
        const result = await execute(`{ allDeliveries { deliveryNumber } }`);
        expect(result.error).to.be.undefined;
        return result.data.allDeliveries.map((d: any) => d.deliveryNumber);
    }

    describe('recordPlan', () => {
        it('records plan, stats and discarded plans by default', async () => {
            const result = await execute(`{ allDeliveries { deliveryNumber } }`, {
                recordPlan: true,
            });
            expect(result.error).to.be.undefined;
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps).to.have.lengthOf(1);
            expect(steps[0].plan?.nodes.length).to.be.greaterThan(0);
            expect(steps[0].stats).not.to.be.undefined;
            expect(steps[0].discardedPlans).to.be.an('array');
        });

        it('does not record discarded plans with recordDiscardedPlans: false', async () => {
            const result = await execute(`{ allDeliveries { deliveryNumber } }`, {
                recordPlan: true,
                recordDiscardedPlans: false,
            });
            expect(result.error).to.be.undefined;
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps).to.have.lengthOf(1);
            expect(steps[0].plan?.nodes.length).to.be.greaterThan(0);
            expect(steps[0].stats).not.to.be.undefined;
            expect(steps[0].discardedPlans).to.be.undefined;
        });

        it('records the plan of a failed query with recordDiscardedPlans: false', async () => {
            await execute(`mutation { createDelivery(input: { deliveryNumber: "1" }) { id } }`);

            const result = await execute(`{ allDeliveries { deliveryNumber } }`, {
                recordPlan: true,
                recordDiscardedPlans: false,
                queryMemoryLimit: 1,
            });
            expect(result.error?.message).to.contain('would use more memory than allowed');
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps).to.have.lengthOf(1);
            expect(steps[0].plan?.nodes.length).to.be.greaterThan(0);
            expect(steps[0].stats).to.be.undefined;
        });
    });

    describe('explainOnly', () => {
        it('plans a query without executing it', async () => {
            await execute(`mutation { createDelivery(input: { deliveryNumber: "1" }) { id } }`);

            const result = await execute(`{ allDeliveries { deliveryNumber } }`, {
                explainOnly: true,
                recordTimings: true,
            });
            expect(result.error).to.be.undefined;
            expect(result.data).to.be.undefined;
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps).to.have.lengthOf(1);
            expect(steps[0].query).to.contain('FOR');
            expect(steps[0].plan?.nodes.length).to.be.greaterThan(0);
            expect(steps[0].discardedPlans).to.be.an('array');
            expect(steps[0].stats).to.be.undefined;
            expect(steps[0].placeholderBindVars).to.be.undefined;
            expect(result.profile?.timings?.database.total).to.be.greaterThan(0);
        });

        it('does not record discarded plans with recordDiscardedPlans: false', async () => {
            const result = await execute(`{ allDeliveries { deliveryNumber } }`, {
                explainOnly: true,
                recordDiscardedPlans: false,
            });
            expect(result.error).to.be.undefined;
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps).to.have.lengthOf(1);
            expect(steps[0].plan?.nodes.length).to.be.greaterThan(0);
            expect(steps[0].discardedPlans).to.be.undefined;
        });

        it('does not write anything for a create mutation', async () => {
            const result = await execute(
                `mutation { createDelivery(input: { deliveryNumber: "1" }) { id deliveryNumber } }`,
                { explainOnly: true },
            );
            expect(result.error).to.be.undefined;
            expect(result.data).to.be.undefined;
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps.length).to.be.greaterThan(1);
            for (const step of steps) {
                expect(step.plan?.nodes.length).to.be.greaterThan(0);
            }
            expect(steps.some((s) => s.plan?.isModificationQuery)).to.be.true;
            // the last step reads the created entity
            expect(steps[steps.length - 1].placeholderBindVars).to.have.lengthOf(1);

            expect(await getDeliveryNumbers()).to.deep.equal([]);
        });

        it('does not write anything for update and delete mutations', async () => {
            const createResult = await execute(
                `mutation { createDelivery(input: { deliveryNumber: "1", itemCount: 1 }) { id } }`,
            );
            const id = createResult.data.createDelivery.id;

            const updateResult = await execute(
                `mutation { updateDelivery(input: { id: "${id}", itemCount: 2 }) { itemCount } }`,
                { explainOnly: true },
            );
            expect(updateResult.error).to.be.undefined;
            const updateSteps = updateResult.profile?.plan?.transactionSteps ?? [];
            expect(updateSteps.length).to.be.greaterThan(1);
            for (const step of updateSteps) {
                expect(step.plan?.nodes.length).to.be.greaterThan(0);
            }

            const deleteResult = await execute(`mutation { deleteAllDeliveries { id } }`, {
                explainOnly: true,
            });
            expect(deleteResult.error).to.be.undefined;

            const readResult = await execute(`{ allDeliveries { deliveryNumber itemCount } }`);
            expect(readResult.data.allDeliveries).to.deep.equal([
                { deliveryNumber: '1', itemCount: 1 },
            ]);
        });

        it('plans queries that iterate over results of earlier queries', async () => {
            const result = await execute(
                `mutation { createDeliveries(input: [{ deliveryNumber: "1" }, { deliveryNumber: "2" }]) { id } }`,
                { explainOnly: true },
            );
            expect(result.error).to.be.undefined;
            const steps = result.profile?.plan?.transactionSteps ?? [];
            for (const step of steps) {
                expect(step.plan?.nodes.length).to.be.greaterThan(0);
            }
            // the ids of the created entities are not known without executing the insert query. ArangoDB
            // does not accept null as operand of FOR, so this checks that the placeholder is not
            // evaluated during planning
            const readStep = steps.find((s) =>
                s.placeholderBindVars?.some((name) =>
                    new RegExp(`FOR \\w+\\s+IN @${name}\\b`).test(s.query),
                ),
            );
            expect(readStep).not.to.be.undefined;
            expect(readStep!.boundValues[readStep!.placeholderBindVars![0]]).to.be.null;

            expect(await getDeliveryNumbers()).to.deep.equal([]);
        });

        it('applies authorization', async () => {
            const result = await execute(
                `mutation { createDelivery(input: { deliveryNumber: "1" }) { id } }`,
                { explainOnly: true, authContext: { authRoles: [] } },
            );
            expect(result.error).to.be.undefined;
            // permission errors are part of the data, which is not available with explainOnly, but
            // the explained query shows that no data is accessed
            const steps = result.profile?.plan?.transactionSteps ?? [];
            expect(steps).to.have.lengthOf(1);
            expect(Object.values(steps[0].boundValues)).to.include('PERMISSION_DENIED');
            expect(steps[0].plan?.isModificationQuery).to.be.false;

            expect(await getDeliveryNumbers()).to.deep.equal([]);
        });

        it('rejects mutations with mutationMode: disallowed', async () => {
            await expect(
                execute(`mutation { createDelivery(input: { deliveryNumber: "1" }) { id } }`, {
                    explainOnly: true,
                    mutationMode: 'disallowed',
                }),
            ).rejects.toThrow('Mutations are not allowed');
        });

        it('reports the plan to the profileConsumer when executed via a GraphQL schema', async () => {
            const profiles: Array<RequestProfile> = [];
            const schemaProject = new Project({
                sources: [new ProjectSource('schema.graphql', source)],
                getExecutionOptions: () => ({
                    authContext: { authRoles: ['allusers'] },
                    explainOnly: true,
                }),
                profileConsumer: (profile) => profiles.push(profile),
            });
            const schema = schemaProject.createSchema(adapter);
            const result = await graphql({
                schema,
                source: `mutation { createDelivery(input: { deliveryNumber: "1" }) { id } }`,
            });
            // there is no data, so the non-nullable root field causes an error
            expect(result.errors?.map((e) => e.message)).to.deep.equal([
                'Cannot return null for non-nullable field Mutation.createDelivery.',
            ]);
            expect(profiles).to.have.lengthOf(1);
            expect(profiles[0].plan?.transactionSteps.length).to.be.greaterThan(1);

            expect(await getDeliveryNumbers()).to.deep.equal([]);
        });

        it('is not supported by the InMemoryAdapter', async () => {
            const inMemoryAdapter = new InMemoryAdapter();
            await inMemoryAdapter.updateSchema(project.getModel());
            const inMemoryExecutor = project.createSchemaExecutor(inMemoryAdapter);
            await expect(
                inMemoryExecutor.tryExecute({
                    document: gql`
                        {
                            allDeliveries {
                                id
                            }
                        }
                    `,
                    options: { authContext: { authRoles: ['allusers'] }, explainOnly: true },
                }),
            ).rejects.toThrow('explainOnly is not supported by the InMemoryAdapter');
        });
    });
});
