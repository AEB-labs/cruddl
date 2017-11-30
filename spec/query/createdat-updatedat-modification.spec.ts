import {createSchema} from "../../src/schema/schema-builder";
import {execute, parse, Source} from "graphql";
import {ArangoDBAdapter} from "../../src/database/arangodb/arangodb-adapter";
import {addQueryResolvers} from "../../src/query/query-resolvers";
import {createTempDatabase} from "../regression/initialization";
import {sleep} from "../../src/utils/utils";

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

    const context = {
        "authRoles": [ "allusers" ]
    };

    it('sets createdAt and updatedAt correctly', async() => {
        // on a freshly created delivery
        const schema = createSchema({ schemaParts: [{ source: new Source(astSchema)}]});
        const db = new ArangoDBAdapter(await createTempDatabase());
        await db.updateSchema(schema);
        const executableSchema = addQueryResolvers(schema, db);
        const createResult: any = await execute(executableSchema, parse(createDelivery), {}, context);
        const id = createResult.data.createDelivery.id;
        const createCreatedAt = createResult.data.createDelivery.createdAt;
        const createUpdatedAt = createResult.data.createDelivery.updatedAt;
        expect(createCreatedAt).toBeDefined();
        expect(createUpdatedAt).toBe(createCreatedAt);

        await sleep(1);

        const preparedUpdateDelivery = updateDelivery.replace('%id%', id);
        const updateResult: any = await execute(executableSchema, parse(preparedUpdateDelivery), {}, context);

        const updateCreatedAt = updateResult.data.updateDelivery.createdAt;
        const updateUpdatedAt = updateResult.data.updateDelivery.updatedAt;
        // createdAt must not be changed.
        expect(updateCreatedAt).toBe(createCreatedAt);
        // updatedAt has changed
        const minimumEstimatedUpdatedAt = Date.parse(updateCreatedAt) + 1;
        const maximumEstimatedUpdatedAt = Date.now();
        expect(Date.parse(updateUpdatedAt)).toBeGreaterThan(minimumEstimatedUpdatedAt);
        expect(Date.parse(updateUpdatedAt)).toBeLessThan(maximumEstimatedUpdatedAt);

        sleep(1);

        // create item
        const createItemResult: any = await execute(executableSchema, parse(createDeliveryItem), {}, context);
        const createItemCreatedAt = createItemResult.data.createDeliveryItem.createdAt;
        const createItemUpdatedAt = createItemResult.data.createDeliveryItem.updatedAt;
        const itemId = createItemResult.data.createDeliveryItem.id;
        expect(createItemCreatedAt).toBeDefined();
        expect(createItemUpdatedAt).toBe(createItemCreatedAt);

        // update delivery but set relation only
        const preparedUpdateDeliveryRelationOnly = updateDeliveryRelationOnly.replace('%id%', id).replace('%itemId%', itemId);
        const updateDeliveryRelationOnlyResult: any = await execute(executableSchema, parse(preparedUpdateDeliveryRelationOnly), {}, context);
        const updateDeliveryRelationOnlyUpdatedAt = updateDeliveryRelationOnlyResult.data.updateDelivery.updatedAt;
        // updatedAt must not have been changed, because only a relation was modified.
        expect(updateDeliveryRelationOnlyUpdatedAt).toBe(updateUpdatedAt);

        // update delivery item and remove delivery.
        const preparedUpdateDeliveryItemRelationOnly = updateDeliveryItemRelationOnly.replace('%itemId%', itemId);
        const updateDeliveryItemRelationOnlyResult: any = await execute(executableSchema, parse(preparedUpdateDeliveryItemRelationOnly), {}, context);
        const updateItemCreatedAt = updateDeliveryItemRelationOnlyResult.data.updateDeliveryItem.createdAt;
        const updateItemUpdatedAt = updateDeliveryItemRelationOnlyResult.data.updateDeliveryItem.updatedAt;

        // item createdAt and updatedAt still the same
        expect(updateItemCreatedAt).toBe(createItemCreatedAt);
        expect(updateItemUpdatedAt).toBe(createItemUpdatedAt);

        // check persistence of delivery updated at
        const preparedSelectDelivery = selectDelivery.replace('%id%', id);
        const selectResult: any = await execute(executableSchema, parse(preparedSelectDelivery), {}, context);
        const selectCreatedAt = selectResult.data.Delivery.createdAt;
        const selectUpdatedAt = selectResult.data.Delivery.updatedAt;

        // createdAt still not changed
        expect(selectCreatedAt).toBe(createCreatedAt);
        // former result is persisted
        expect(selectUpdatedAt).toBe(updateUpdatedAt);





    });

});