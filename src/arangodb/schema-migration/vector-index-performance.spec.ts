// noinspection GraphQLUnresolvedReference

import { aql, Database } from 'arangojs';
import { graphql, type GraphQLSchema } from 'graphql';
import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { prettyPrint } from '../../core/graphql/pretty-print.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import { createTempDatabase } from '../../testing/regression-tests/initialization.js';
import { ArangoDBAdapter } from '../arangodb-adapter.js';
import { isArangoDBDisabled } from '../testing/is-arangodb-disabled.js';
import { vectorIndexSlotName } from './index-helpers.js';

const DIMENSION = 128;
const INITIAL_DOC_COUNT = 20_000;
const ADDITIONAL_DOC_COUNT = 30_000;

describe.skipIf(isArangoDBDisabled())('vector index performance (integration)', () => {
    it('trains a vector index, detects nLists drift, rebuilds, and serves queries', async () => {
        // ----------------------------------------------------------------
        // Set up project and database
        // ----------------------------------------------------------------
        const project = new Project({
            sources: [
                new ProjectSource(
                    'schema.graphql',
                    prettyPrint(gql`
                        type Article @rootEntity {
                            title: String
                            embedding: [Float] @vectorIndex(dimension: ${DIMENSION}, defaultNProbe: 10, maxNProbe: 50)
                        }
                    `),
                ),
            ],
            getExecutionOptions: () => ({ disableAuthorization: true }),
        });
        const model = project.getModel();
        const dbConfig = await createTempDatabase();
        const db = new Database(dbConfig);
        const adapter = new ArangoDBAdapter({
            ...dbConfig,
            vectorIndexNListsRebuildThreshold: 0.25,
        });
        const schema = project.createSchema(adapter);
        await adapter.updateSchema(model);

        // ----------------------------------------------------------------
        // Insert initial batch of documents
        // ----------------------------------------------------------------
        await insertVectorDocuments(db, 'articles', INITIAL_DOC_COUNT, DIMENSION, 0);
        const docCount = (await db.collection('articles').count()).count;
        expect(docCount).to.equal(INITIAL_DOC_COUNT);

        // ----------------------------------------------------------------
        // Run initial migration — creates vector index in slot A
        // ----------------------------------------------------------------
        const initialMigrations = await adapter.getOutstandingMigrations(model);
        expect(initialMigrations).toHaveLength(1);
        const trainStart = performance.now();
        await adapter.performMigration(initialMigrations[0]);
        const trainDurationMs = performance.now() - trainStart;

        // Expect training to take at least a little time with 20k docs x 128 dims
        // but not too long (generous timeout for CI)
        console.log(`Initial index training took ${trainDurationMs.toFixed(0)}ms`);
        expect(trainDurationMs).to.be.greaterThan(500);
        expect(trainDurationMs).to.be.lessThan(60_000);

        // Verify the index is in slot A
        const indexes = await db.collection('articles').indexes();
        const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
        expect(vectorIndexes).to.have.lengthOf(1);
        expect(vectorIndexes[0].name).to.equal(vectorIndexSlotName('embedding', 'a'));

        // Verify no more migrations pending
        const postCreateMigrations = await adapter.getOutstandingMigrations(model);
        expect(postCreateMigrations).to.have.lengthOf(0);

        // ----------------------------------------------------------------
        // Immediately query the index after migration
        // ----------------------------------------------------------------
        await testVectorSearch(schema);

        // ----------------------------------------------------------------
        // Insert a large additional batch to trigger nLists drift
        // ----------------------------------------------------------------
        await insertVectorDocuments(
            db,
            'articles',
            ADDITIONAL_DOC_COUNT,
            DIMENSION,
            INITIAL_DOC_COUNT,
        );

        const newDocCount = (await db.collection('articles').count()).count;
        expect(newDocCount).to.equal(INITIAL_DOC_COUNT + ADDITIONAL_DOC_COUNT);

        // ----------------------------------------------------------------
        // Run the drift migration and verify index is continuously queryable
        // ----------------------------------------------------------------
        const driftMigrations = await adapter.getOutstandingMigrations(model);
        expect(driftMigrations).toHaveLength(1);

        const rebuildStart = performance.now();
        // Start migration in background and poll the index continuously.
        const migrationPromise = adapter.performMigration(driftMigrations[0]);

        let pollingError: unknown = undefined;
        let migrationError: unknown = undefined;
        let stopPolling = false;
        const pollIntervalMs = 100;

        const poller = (async () => {
            try {
                while (!stopPolling) {
                    await testVectorSearch(schema);
                    await new Promise((r) => setTimeout(r, pollIntervalMs));
                }
            } catch (err) {
                pollingError = err;
                stopPolling = true;
            }
        })();

        try {
            await migrationPromise;
        } catch (err) {
            migrationError = err;
        } finally {
            stopPolling = true;
            await poller;
        }

        const rebuildDurationMs = performance.now() - rebuildStart;

        if (pollingError) throw pollingError;
        if (migrationError) throw migrationError;

        console.log(`Drift rebuild took ${rebuildDurationMs.toFixed(0)}ms`);
        expect(trainDurationMs).to.be.greaterThan(500);
        expect(rebuildDurationMs).to.be.lessThan(30_000);

        // After rebuild, the index should be in slot B (A -> B swap)
        const postRebuildIndexes = await db.collection('articles').indexes();
        const postRebuildVector = postRebuildIndexes.filter((i: any) => i.type === 'vector');
        expect(postRebuildVector).to.have.lengthOf(1);
        expect(postRebuildVector[0].name).to.equal(vectorIndexSlotName('embedding', 'b'));

        // ----------------------------------------------------------------
        // Verify the rebuilt index is immediately queryable
        // ----------------------------------------------------------------

        await testVectorSearch(schema);

        // ----------------------------------------------------------------
        // System should be stable (no more migrations)
        // ----------------------------------------------------------------
        const finalMigrations = await adapter.getOutstandingMigrations(model);
        expect(finalMigrations).toHaveLength(0);
    }, 300_000); // 5 min timeout for the whole test
});

function randomVector(dim: number): number[] {
    const v = new Array(dim);
    for (let i = 0; i < dim; i++) {
        v[i] = Math.random() * 2 - 1; // [-1, 1]
    }
    return v;
}

async function insertVectorDocuments(
    db: Database,
    collectionName: string,
    count: number,
    dim: number,
    indexOffset: number,
): Promise<void> {
    // Insert in batches of 1000 to avoid oversized AQL queries
    const batchSize = 1000;
    for (let start = 0; start < count; start += batchSize) {
        const batchCount = Math.min(batchSize, count - start);
        const docs = [];
        for (let i = 0; i < batchCount; i++) {
            docs.push({
                title: `Doc ${indexOffset + start + i}`,
                embedding: randomVector(dim),
            });
        }
        await db.query(aql`FOR doc IN ${docs} INSERT doc INTO ${db.collection(collectionName)}`);
    }
}

async function testVectorSearch(schema: GraphQLSchema) {
    const queryVector = randomVector(DIMENSION);
    const result = await graphql({
        schema,
        source: prettyPrint(gql`
            query ($v: [Float!]!) {
                vectorSearchArticles(field: embedding, vector: $v, first: 10) {
                    title
                    _vectorScore
                }
            }
        `),
        variableValues: { v: queryVector },
        rootValue: {},
        contextValue: {},
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.vectorSearchArticles).toHaveLength(10);
}
