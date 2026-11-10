import { gql } from 'graphql-tag';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionOptions } from '../core/execution/execution-options.js';
import type { SchemaExecutor } from '../core/execution/schema-executor.js';
import { Project } from '../core/project/project.js';
import { ProjectSource } from '../core/project/source.js';
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
    let executor: SchemaExecutor;

    beforeEach(async () => {
        const project = new Project({
            sources: [new ProjectSource('schema.graphql', source)],
        });
        const adapter = new ArangoDBAdapter(await createTempDatabase());
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
});
