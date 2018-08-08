import { expect } from 'chai';
import gql from 'graphql-tag';
import { ArangoDBAdapter } from '../../../src/database/arangodb';
import { createSimpleModel } from '../../model/model-spec.helper';
import { createTempDatabase, getTempDatabase } from '../../regression/initialization';

describe('ArangoDBAdapter', () => {
    describe('updateSchema', () => {
        describe('indices', () => {
            it('creates new indices', async function () { // can't use arrow function because we need the "this"
                if (isArangoDBDisabled()) {
                    (this as any).skip();
                    return;
                }

                const model = createSimpleModel(gql`
                    type Delivery @rootEntity {
                        deliveryNumber: String @key
                        isShipped: Boolean @index
                        itemCount: Int @index
                    }
                `);

                const adapter = new ArangoDBAdapter(await createTempDatabase());
                const db = getTempDatabase();

                await db.collection('deliveries').create({});

                // add an index that completely fits
                await db.collection('deliveries').createIndex({
                    fields: ['itemCount'],
                    sparse: false,
                    unique: false,
                    type: 'persistent'
                });

                // add an index that *almost* fits
                await db.collection('deliveries').createIndex({
                    fields: ['deliveryNumber'],
                    sparse: false,
                    unique: true,
                    type: 'persistent'
                });

                await adapter.updateSchema(model);

                const indices = await db.collection('deliveries').indexes();
                expect(indices.map(index => ({
                    fields: index.fields,
                    sparse: index.sparse,
                    type: index.type,
                    unique: index.unique
                }))).to.deep.equal([
                    {
                        fields: [
                            '_key'
                        ],
                        sparse: false,
                        type: 'primary',
                        unique: true
                    },
                    {
                        fields: [
                            'itemCount'
                        ],
                        sparse: false,
                        type: 'persistent',
                        unique: false
                    },
                    // this one already existed before and is kept
                    {
                        fields: [
                            'deliveryNumber'
                        ],
                        sparse: false,
                        type: 'persistent',
                        unique: true
                    },
                    {
                        fields: [
                            'isShipped'
                        ],
                        sparse: false,
                        type: 'persistent',
                        unique: false
                    },
                    {
                        fields: [
                            'deliveryNumber'
                        ],
                        sparse: true,
                        type: 'persistent',
                        unique: true
                    }
                ]);
            });
        });
    });
});

function isArangoDBDisabled() {
    return process.argv.includes('--db=in-memory');
}
