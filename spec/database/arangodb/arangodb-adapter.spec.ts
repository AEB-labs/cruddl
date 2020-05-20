import { expect } from 'chai';
import gql from 'graphql-tag';
import { ArangoDBAdapter } from '../../../src/database/arangodb';
import { createSimpleModel } from '../../model/model-spec.helper';
import { createTempDatabase, getTempDatabase } from '../../regression/initialization';
import { isArangoDBDisabled } from './arangodb-test-utils';

describe('ArangoDBAdapter', () => {
    describe('updateSchema', () => {
        it('it creates and removes indices', async function() {
            // can't use arrow function because we need the "this"
            if (isArangoDBDisabled()) {
                (this as any).skip();
                return;
            }

            const model = createSimpleModel(gql`
                type Delivery @rootEntity {
                    deliveryNumber: String @key
                    isShipped: Boolean @index
                    shippedAt: DateTime @index(sparse: true)
                    itemCount: Int @index
                    indexedTwice: String @index @unique
                }
            `);

            const dbConfig = await createTempDatabase();
            const adapter = new ArangoDBAdapter({
                ...dbConfig,
                createIndicesInBackground: true
            });
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

            // add a non-unique index that is needed for @index, but should not satisfy the @unique index
            await db.collection('deliveries').createIndex({
                fields: ['indexedTwice'],
                sparse: false,
                unique: false,
                type: 'persistent'
            });

            await adapter.updateSchema(model);

            const indices = await db.collection('deliveries').indexes();
            const expectedIndices = [
                {
                    fields: ['_key'],
                    sparse: false,
                    type: 'primary',
                    unique: true
                },
                {
                    fields: ['isShipped'],
                    sparse: false,
                    type: 'persistent',
                    unique: false
                },
                {
                    fields: ['itemCount'],
                    sparse: false,
                    type: 'persistent',
                    unique: false
                },
                // for automatic absolute ordering
                {
                    fields: ['_key'],
                    sparse: false,
                    type: 'persistent',
                    unique: false
                },
                {
                    fields: ['deliveryNumber'],
                    sparse: true,
                    type: 'persistent',
                    unique: true
                },
                {
                    fields: ['shippedAt'],
                    sparse: true,
                    unique: false,
                    type: 'persistent'
                },
                {
                    fields: ['indexedTwice'],
                    sparse: true,
                    unique: true,
                    type: 'persistent'
                },
                {
                    fields: ['indexedTwice'],
                    sparse: false,
                    unique: false,
                    type: 'persistent'
                }
            ];
            expect(
                indices.map((index: any) => ({
                    fields: index.fields,
                    sparse: index.sparse,
                    type: index.type,
                    unique: index.unique
                }))
            ).to.deep.equalInAnyOrder(expectedIndices);

            const indicesOnOtherCollection = await db.collection('second').indexes();
            expect(
                indicesOnOtherCollection.map((index: any) => ({
                    fields: index.fields,
                    sparse: index.sparse,
                    type: index.type,
                    unique: index.unique
                }))
            ).to.deep.equal([
                {
                    fields: ['_key'],
                    sparse: false,
                    type: 'primary',
                    unique: true
                },
                {
                    fields: ['test'],
                    sparse: false,
                    type: 'persistent',
                    unique: true
                }
            ]);
        });
    });
});
