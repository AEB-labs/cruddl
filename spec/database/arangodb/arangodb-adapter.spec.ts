import { expect } from 'chai';
import gql from 'graphql-tag';
import { ArangoDBAdapter } from '../../../src/database/arangodb';
import { createSimpleModel } from '../../model/model-spec.helper';
import { createTempDatabase, getTempDatabase } from '../../regression/initialization';

describe('ArangoDBAdapter', () => {
    describe('updateSchema', () => {
        it('it creates and removes indices', async function () { // can't use arrow function because we need the "this"
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

            // add an index that *almost* fits. Will be removed
            await db.collection('deliveries').createIndex({
                fields: ['deliveryNumber'],
                sparse: false,
                unique: true,
                type: 'persistent'
            });

            // add an index on a different collection. Will be kept.
            await db.collection('second').create({});
            await db.collection('second').createIndex({
                fields: ['test'],
                sparse: false,
                unique: true,
                type: 'persistent'
            });

            await adapter.updateSchema(model);

            const indices = await db.collection('deliveries').indexes();
            expect(indices.map((index: any) => ({
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
                },
                // this one is for @reference lookup which needs a non-sparse (see shouldUseWorkaroundForSparseIndices)
                {
                    fields: [
                        'deliveryNumber'
                    ],
                    sparse: false,
                    type: 'persistent',
                    unique: false
                }
            ]);

            const indicesOnOtherCollection = await db.collection('second').indexes();
            expect(indicesOnOtherCollection.map((index: any) => ({
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
                        'test'
                    ],
                    sparse: false,
                    type: 'persistent',
                    unique: true
                }
            ]);
        });
    });
});

function isArangoDBDisabled() {
    return process.argv.includes('--db=in-memory');
}
