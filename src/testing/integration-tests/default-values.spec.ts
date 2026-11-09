import { graphql } from 'graphql';
import { describe, expect, it } from 'vitest';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import { InMemoryAdapter } from '../../inmemory/inmemory-adapter.js';

describe('@defaultValue', () => {
    const source = `
        type Delivery @rootEntity @roles(readWrite: "allusers") {
            deliveryNumber: String
            dateTime: DateTime @defaultValue(value: "2020-01-01T12:00+00:00")
            offsetDateTime: OffsetDateTime @defaultValue(value: "2020-01-01T12:00:00+02:00")
            offsetDateTimes: [OffsetDateTime] @defaultValue(value: ["2020-01-01T12:00:00+02:00"])
            decimal: Decimal2 @defaultValue(value: 1.234)
            window: TimeWindow @defaultValue(value: { start: "2020-01-01T08:00:00+01:00" })
        }

        type TimeWindow @valueObject {
            start: OffsetDateTime
        }
    `;

    async function createSchema() {
        const project = new Project({
            sources: [new ProjectSource('schema.graphql', source)],
            getExecutionOptions: () => ({ authContext: { authRoles: ['allusers'] } }),
        });
        const db = new InMemoryAdapter();
        const schema = project.createSchema(db);
        await db.updateSchema(project.getModel());
        return schema;
    }

    it('stores default values like equivalent input values', async () => {
        const schema = await createSchema();
        const createResult: any = await graphql({
            schema,
            source: `
                mutation {
                    createDelivery(input: { deliveryNumber: "1" }) {
                        dateTime
                        offsetDateTime
                        offsetDateTimes
                        decimal
                        window { start }
                    }
                }
            `,
            rootValue: {},
        });
        expect(createResult.errors).to.be.undefined;
        expect(createResult.data.createDelivery).to.deep.equal({
            dateTime: '2020-01-01T12:00:00Z',
            offsetDateTime: '2020-01-01T12:00:00+02:00',
            offsetDateTimes: ['2020-01-01T12:00:00+02:00'],
            decimal: 1.23,
            window: { start: '2020-01-01T08:00:00+01:00' },
        });

        // filters do not coerce stored values, so this verifies how the values are stored
        const filterResult: any = await graphql({
            schema,
            source: `
                query {
                    allDeliveries(
                        filter: {
                            dateTime: "2020-01-01T12:00:00Z"
                            offsetDateTime_gt: "2020-01-01T09:00:00Z"
                            offsetDateTime_lt: "2020-01-01T11:00:00Z"
                            decimal: 1.23
                            window: { start_lt: "2020-01-01T07:30:00Z" }
                        }
                    ) {
                        deliveryNumber
                    }
                }
            `,
            rootValue: {},
        });
        expect(filterResult.errors).to.be.undefined;
        expect(filterResult.data.allDeliveries).to.deep.equal([{ deliveryNumber: '1' }]);
    });
});
