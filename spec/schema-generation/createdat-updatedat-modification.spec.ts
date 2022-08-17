import { expect } from 'chai';
import { execute, graphql, parse } from 'graphql';
import { InMemoryAdapter } from '../../src/database/inmemory';
import { Project } from '../../src/project/project';
import { ProjectSource } from '../../src/project/source';
import { sleep } from '../../src/utils/utils';

describe('mutation', () => {
    const astSchema = `
    type Delivery @rootEntity @roles(readWrite: "allusers") {
        deliveryNumber: String
        deliveryItems: [DeliveryItem] @relation
    }

    type DeliveryItem @rootEntity @roles(readWrite: "allusers") {
        itemNumber: Int
        delivery: Delivery @relation(inverseOf:"deliveryItems")
    }
    `;

    const createDelivery = `
    mutation {
        createDelivery(input: { deliveryNumber: "42" }) {
            id
            createdAt
            updatedAt
        }
    }
    `;

    const updateDelivery = `
        mutation {
            updateDelivery(input: { id: "%id%", deliveryNumber: "0815" }) {
                createdAt
                updatedAt
            }
        }
    `;

    const updateDeliveryRelationOnly = `
        mutation {
            updateDelivery(input: { id: "%id%", addDeliveryItem: "%itemId%" }) {
                createdAt
                updatedAt
            }
        }
    `;

    const updateDeliveryItemRelationOnly = `
        mutation {
            updateDeliveryItem(input: { id: "%itemId%", delivery: null }) {
                createdAt
                updatedAt
            }
        }
    `;

    const createDeliveryItem = `
        mutation {
            createDeliveryItem(input: { itemNumber: 5 }) {
                id
                createdAt
                updatedAt
            }
        }
    `;

    const selectDelivery = `
        query {
            Delivery(id: "%id%") {
                createdAt
                updatedAt
            }
        }
    `;

    function expectNoErrors(result: any) {
        expect(result.errors, result.errors).to.be.undefined;
    }

    it('sets createdAt and updatedAt correctly', async () => {
        // on a freshly created delivery
        const project = new Project({
            sources: [new ProjectSource('schema.graphql', astSchema)],
            getExecutionOptions: () => ({ authContext: { authRoles: ['allusers'] } }),
        });
        const db = new InMemoryAdapter();
        const schema = project.createSchema(db);
        await db.updateSchema(project.getModel());

        const createResult: any = await graphql(schema, createDelivery, {});
        expectNoErrors(createResult);
        const id = createResult.data.createDelivery.id;
        const createCreatedAt = createResult.data.createDelivery.createdAt;
        const createUpdatedAt = createResult.data.createDelivery.updatedAt;
        expect(createCreatedAt).to.not.be.undefined;
        expect(createUpdatedAt).to.equal(createCreatedAt);

        await sleep(1);

        const preparedUpdateDelivery = updateDelivery.replace('%id%', id);
        const updateResult: any = await graphql(schema, preparedUpdateDelivery, {});
        expectNoErrors(updateResult);

        const updateCreatedAt = updateResult.data.updateDelivery.createdAt;
        const updateUpdatedAt = updateResult.data.updateDelivery.updatedAt;
        // createdAt must not be changed.
        expect(updateCreatedAt).to.equal(createCreatedAt);
        // updatedAt has changed
        const minimumEstimatedUpdatedAt = Date.parse(updateCreatedAt) + 1;
        const maximumEstimatedUpdatedAt = Date.now();
        expect(Date.parse(updateUpdatedAt)).to.be.greaterThan(minimumEstimatedUpdatedAt);
        expect(Date.parse(updateUpdatedAt)).to.be.lte(maximumEstimatedUpdatedAt);

        await sleep(1);

        // create item
        const createItemResult: any = await graphql(schema, createDeliveryItem, {});
        expectNoErrors(createItemResult);
        const createItemCreatedAt = createItemResult.data.createDeliveryItem.createdAt;
        const createItemUpdatedAt = createItemResult.data.createDeliveryItem.updatedAt;
        const itemId = createItemResult.data.createDeliveryItem.id;
        expect(createItemCreatedAt).to.not.be.undefined;
        expect(createItemUpdatedAt).to.equal(createItemCreatedAt);

        // update delivery but set relation only
        const preparedUpdateDeliveryRelationOnly = updateDeliveryRelationOnly
            .replace('%id%', id)
            .replace('%itemId%', itemId);
        const updateDeliveryRelationOnlyResult: any = await execute(
            schema,
            parse(preparedUpdateDeliveryRelationOnly),
            {}
        );
        const updateDeliveryRelationOnlyUpdatedAt = updateDeliveryRelationOnlyResult.data.updateDelivery.updatedAt;
        // updatedAt must not have been changed, because only a relation was modified.
        expect(updateDeliveryRelationOnlyUpdatedAt).to.equal(updateUpdatedAt);

        // update delivery item and remove delivery.
        const preparedUpdateDeliveryItemRelationOnly = updateDeliveryItemRelationOnly.replace('%itemId%', itemId);
        const updateDeliveryItemRelationOnlyResult: any = await execute(
            schema,
            parse(preparedUpdateDeliveryItemRelationOnly),
            {}
        );
        const updateItemCreatedAt = updateDeliveryItemRelationOnlyResult.data.updateDeliveryItem.createdAt;
        const updateItemUpdatedAt = updateDeliveryItemRelationOnlyResult.data.updateDeliveryItem.updatedAt;

        // item createdAt and updatedAt still the same
        expect(updateItemCreatedAt).to.equal(createItemCreatedAt);
        expect(updateItemUpdatedAt).to.equal(createItemUpdatedAt);

        // check persistence of delivery updated at
        const preparedSelectDelivery = selectDelivery.replace('%id%', id);
        const selectResult: any = await graphql(schema, preparedSelectDelivery, {});
        expectNoErrors(selectResult);
        const selectCreatedAt = selectResult.data.Delivery.createdAt;
        const selectUpdatedAt = selectResult.data.Delivery.updatedAt;

        // createdAt still not changed
        expect(selectCreatedAt).to.equal(createCreatedAt);
        // former result is persisted
        expect(selectUpdatedAt).to.equal(updateUpdatedAt);
    });
});
