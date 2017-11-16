
import {createSchema} from "../../src/schema/schema-builder";
import {execute, Source, parse} from "graphql";
import {ArangoDBAdapter} from "../../src/database/arangodb/arangodb-adapter";
import {addQueryResolvers} from "../../src/query/query-resolvers";
import {create} from "domain";
import {createTempDatabase} from "../regression/initialization";
import {sleep} from "../../src/utils/utils";

describe('mutation', () => {
    const databaseName = 'momo';
    const databaseURL = 'http://root:@localhost:8529';

    const astSchema = `
    type Delivery @rootEntity @roles(readWrite: "allusers") {
        deliveryNumber: String
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

        await sleep(1000);

        const preparedUpdateDelivery = updateDelivery.replace('%id%', id);
        const updateResult: any = await execute(executableSchema, parse(preparedUpdateDelivery), {}, context);

        const updateCreatedAt = updateResult.data.updateDelivery.createdAt;
        const updateUpdatedAt = updateResult.data.updateDelivery.updatedAt;
        // createdAt must not be changed.
        expect(updateCreatedAt).toBe(createCreatedAt);
        // updatedAt has changed
        const minimumEstimatedUpdatedAt = Date.parse(updateCreatedAt) + 1000;
        const maximumEstimatedUpdatedAt = Date.now();
        expect(Date.parse(updateUpdatedAt)).toBeGreaterThan(minimumEstimatedUpdatedAt);
        expect(Date.parse(updateUpdatedAt)).toBeLessThan(maximumEstimatedUpdatedAt);

        // check persistence of updated at
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