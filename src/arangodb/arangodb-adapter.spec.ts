import type { ArangoSearchViewProperties } from 'arangojs/views';
import { gql } from 'graphql-tag';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTempDatabase, getTempDatabase } from '../testing/regression-tests/initialization.js';
import { createSimpleModel } from '../testing/utils/create-simple-model.js';
import { ArangoDBAdapter } from './arangodb-adapter.js';
import { vectorIndexSlotName } from './schema-migration/index-helpers.js';
import { isArangoDBDisabled } from './testing/is-arangodb-disabled.js';

describe.skipIf(isArangoDBDisabled())('ArangoDBAdapter', () => {
    describe('updateSchema', () => {
        it('it creates and removes indices', async () => {
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
                createIndicesInBackground: true,
            });
            const db = getTempDatabase();
            await db.collection('deliveries').create({});

            // add an index that completely fits
            await db.collection('deliveries').ensureIndex({
                fields: ['itemCount'],
                sparse: false,
                unique: false,
                type: 'persistent',
            });

            // add an index that *almost* fits. Will be removed
            await db.collection('deliveries').ensureIndex({
                fields: ['deliveryNumber'],
                sparse: false,
                unique: true,
                type: 'persistent',
            });

            // add an index on a different collection. Will be kept.
            await db.collection('second').create({});
            await db.collection('second').ensureIndex({
                fields: ['test'],
                sparse: false,
                unique: true,
                type: 'persistent',
            });

            // add a non-unique index that is needed for @index, but should not satisfy the @unique index
            await db.collection('deliveries').ensureIndex({
                fields: ['indexedTwice'],
                sparse: false,
                unique: false,
                type: 'persistent',
            });

            await adapter.updateSchema(model);

            const indices = await db.collection('deliveries').indexes();
            const expectedIndices = [
                {
                    fields: ['_key'],
                    sparse: false,
                    type: 'primary',
                    unique: true,
                },
                {
                    fields: ['isShipped'],
                    sparse: false,
                    type: 'persistent',
                    unique: false,
                },
                {
                    fields: ['itemCount'],
                    sparse: false,
                    type: 'persistent',
                    unique: false,
                },
                // for automatic absolute ordering
                {
                    fields: ['_key'],
                    sparse: false,
                    type: 'persistent',
                    unique: false,
                },
                {
                    fields: ['deliveryNumber'],
                    sparse: true,
                    type: 'persistent',
                    unique: true,
                },
                {
                    fields: ['shippedAt'],
                    sparse: true,
                    unique: false,
                    type: 'persistent',
                },
                {
                    fields: ['indexedTwice'],
                    sparse: true,
                    unique: true,
                    type: 'persistent',
                },
                {
                    fields: ['indexedTwice'],
                    sparse: false,
                    unique: false,
                    type: 'persistent',
                },
            ];
            expect(
                indices
                    .map((index: any) => ({
                        fields: index.fields,
                        sparse: index.sparse,
                        type: index.type,
                        unique: index.unique,
                    }))
                    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
            ).to.deep.equal(
                [...expectedIndices].sort((a, b) =>
                    JSON.stringify(a).localeCompare(JSON.stringify(b)),
                ),
            );

            const indicesOnOtherCollection = await db.collection('second').indexes();
            expect(
                indicesOnOtherCollection.map((index: any) => ({
                    fields: index.fields,
                    sparse: index.sparse,
                    type: index.type,
                    unique: index.unique,
                })),
            ).to.deep.equal([
                {
                    fields: ['_key'],
                    sparse: false,
                    type: 'primary',
                    unique: true,
                },
                {
                    fields: ['test'],
                    sparse: false,
                    type: 'persistent',
                    unique: true,
                },
            ]);
        });

        it('it resets arangosearch view parameters to configured values', async () => {
            const model = createSimpleModel(gql`
                type Delivery
                    @rootEntity(
                        flexSearch: true
                        flexSearchPerformanceParams: {
                            commitIntervalMsec: 2000
                            consolidationIntervalMsec: 8000
                            cleanupIntervalStep: 1
                        }
                    ) {
                    deliveryNumber: String @key @flexSearch
                }
            `);

            const dbConfig = await createTempDatabase();
            const adapter = new ArangoDBAdapter({
                ...dbConfig,
                createIndicesInBackground: true,
            });
            const db = getTempDatabase();
            await adapter.updateSchema(model);

            const view = db.view('flex_view_deliveries');
            const properties = (await view.properties()) as ArangoSearchViewProperties;
            expect(properties.commitIntervalMsec).to.equal(2000);
            expect(properties.consolidationIntervalMsec).to.equal(8000);
            expect(properties.cleanupIntervalStep).to.equal(1);

            await view.updateProperties({
                commitIntervalMsec: 12345,
                consolidationIntervalMsec: 54321,
                cleanupIntervalStep: 7,
            });

            const updatedProperties = (await view.properties()) as ArangoSearchViewProperties;
            expect(updatedProperties.commitIntervalMsec).to.equal(12345);
            expect(updatedProperties.consolidationIntervalMsec).to.equal(54321);
            expect(updatedProperties.cleanupIntervalStep).to.equal(7);

            // running the migrations again should reset it
            await adapter.updateSchema(model);

            const propertiesAfterSecondMigration =
                (await view.properties()) as ArangoSearchViewProperties;
            expect(properties.commitIntervalMsec).to.equal(2000);
            expect(properties.consolidationIntervalMsec).to.equal(8000);
            expect(properties.cleanupIntervalStep).to.equal(1);
        });
    });

    describe('recreateVectorIndex', () => {
        let dbConfig: Awaited<ReturnType<typeof createTempDatabase>>;
        beforeEach(async () => {
            dbConfig = await createTempDatabase();
        });

        it('creates the index in slot A when no index exists', async () => {
            const model = createSimpleModel(gql`
                type Article @rootEntity {
                    embedding: [Float]
                        @vectorIndex(dimension: 4, nLists: 1, defaultNProbe: 10, maxNProbe: 50)
                }
            `);
            const adapter = new ArangoDBAdapter(dbConfig);
            const db = getTempDatabase();

            await db.collection('articles').create({});
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            const field = model.rootEntityTypes[0].fields.find((f) => f.name === 'embedding')!;
            await adapter.recreateVectorIndex(field);

            const indexes = await db.collection('articles').indexes();
            const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
            expect(vectorIndexes).toHaveLength(1);
            expect(vectorIndexes[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));
        }, 30_000);

        it('always recreates even when the existing index already matches (force rebuild)', async () => {
            // This is the key differentiator of recreateVectorIndex: even if the existing
            // index has matching params, it always rebuilds. Because ArangoDB deduplicates
            // ensureIndex calls with identical params, the adapter drops and re-creates in
            // slot A rather than using an A/B rotation.
            const model = createSimpleModel(gql`
                type Article @rootEntity {
                    embedding: [Float]
                        @vectorIndex(dimension: 4, nLists: 1, defaultNProbe: 10, maxNProbe: 50)
                }
            `);
            const adapter = new ArangoDBAdapter(dbConfig);
            const db = getTempDatabase();

            await db.collection('articles').create({});
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            const field = model.rootEntityTypes[0].fields.find((f) => f.name === 'embedding')!;

            // First call: creates slot A
            await adapter.recreateVectorIndex(field);

            const afterFirst = await db.collection('articles').indexes();
            const vectorAfterFirst = afterFirst.filter((i: any) => i.type === 'vector');
            expect(vectorAfterFirst).toHaveLength(1);
            expect(vectorAfterFirst[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));

            // Second call: drops the current index and rebuilds in slot A.
            // ArangoDB's ensureIndex deduplication would return the existing index when params
            // are identical, so a zero-downtime A/B rotation is not possible here. Instead we
            // drop first and create fresh, ending up back in slot A.
            await adapter.recreateVectorIndex(field);

            const afterSecond = await db.collection('articles').indexes();
            const vectorAfterSecond = afterSecond.filter((i: any) => i.type === 'vector');
            expect(vectorAfterSecond).toHaveLength(1);
            expect(vectorAfterSecond[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));
        }, 30_000);

        it('throws when the collection has no documents', async () => {
            const model = createSimpleModel(gql`
                type Article @rootEntity {
                    embedding: [Float]
                        @vectorIndex(dimension: 4, nLists: 1, defaultNProbe: 10, maxNProbe: 50)
                }
            `);
            const adapter = new ArangoDBAdapter(dbConfig);
            const db = getTempDatabase();

            await db.collection('articles').create({});
            // No documents inserted — must throw

            const field = model.rootEntityTypes[0].fields.find((f) => f.name === 'embedding')!;
            await expect(adapter.recreateVectorIndex(field)).rejects.toThrow('has no documents');
        });
    });
});
