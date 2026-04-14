// noinspection GraphQLUnresolvedReference

import type { DocumentCollection } from 'arangojs/collections';
import type { EnsureVectorIndexOptions, VectorIndexDescription } from 'arangojs/indexes';
import type { DocumentNode } from 'graphql';
import { gql } from 'graphql-tag';
import { beforeEach, describe, expect, it } from 'vitest';
import { prettyPrint } from '../../../core/graphql/pretty-print.js';
import { Project } from '../../../core/project/project.js';
import { ProjectSource } from '../../../core/project/source.js';
import {
    createTempDatabase,
    getTempDatabase,
} from '../../../testing/regression-tests/initialization.js';
import type { ArangoDBConfig } from '../../config.js';
import { isArangoDBDisabled } from '../../testing/is-arangodb-disabled.js';
import { SchemaAnalyzer } from '../analyzer.js';
import {
    CreateVectorIndexMigration,
    DropVectorIndexMigration,
    RecreateVectorIndexMigration,
} from '../migrations.js';
import { MigrationPerformer } from '../performer.js';
import { vectorIndexSlotName } from './vector-index-helpers.js';

let dbConfig: ArangoDBConfig;

describe.skipIf(isArangoDBDisabled())(
    'vector index migrations (integration tests)',
    { timeout: 30_000 },
    () => {
        beforeEach(async () => {
            dbConfig = await createTempDatabase();
            // Create the articles collection up-front for most tests
            const db = getTempDatabase();
            await db.createCollection('articles');
        });

        // -----------------------------------------------------------------------
        // Deferred creation
        // -----------------------------------------------------------------------

        it('does not create vector index on an empty collection', async () => {
            const project = buildVectorProject();
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
            expect(migrations).toHaveLength(0);
        });

        it('schedules CreateVectorIndexMigration once the collection has documents', async () => {
            const project = buildVectorProject();
            const db = getTempDatabase();
            await seedArticles(db);

            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(project.getModel());

            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(CreateVectorIndexMigration);
        });

        // -----------------------------------------------------------------------
        // First-time creation always goes to slot A
        // -----------------------------------------------------------------------

        it('creates the index in slot A on first creation', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            await runMigrations(project);

            const indexes = await db.collection('articles').indexes();
            const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
            expect(vectorIndexes).toHaveLength(1);
            expect(vectorIndexes[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));
        });

        it('is stable (no migrations) after creation', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            await runMigrations(project);
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
            expect(migrations).toHaveLength(0);
        });

        // -----------------------------------------------------------------------
        // Recreation: metric change triggers A -> B slot swap
        // -----------------------------------------------------------------------

        it('schedules RecreateVectorIndexMigration when the metric changes', async () => {
            const cosineProject = buildVectorProject({ nLists: 1 });
            const l2Project = buildVectorProject({ metric: 'L2', nLists: 1 });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            // Step 1: create the COSINE index in slot A
            await runMigrations(cosineProject);

            // Step 2: changing the metric should produce a recreate migration
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(l2Project.getModel());
            expect(migrations).toHaveLength(1);
            const [m] = migrations;
            expect(m).toBeInstanceOf(RecreateVectorIndexMigration);
            if (m instanceof RecreateVectorIndexMigration) {
                expect(m.existingIndex.name).toEqual(vectorIndexSlotName('embedding', 'a'));
            }
        });

        it('places the recreated index in slot B when existing index is in slot A', async () => {
            const cosineProject = buildVectorProject({ nLists: 1 });
            const l2Project = buildVectorProject({ metric: 'L2', nLists: 1 });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            await runMigrations(cosineProject);
            await runMigrations(l2Project);

            const indexes = await db.collection('articles').indexes();
            const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
            expect(vectorIndexes).toHaveLength(1);
            expect(vectorIndexes[0].name).toEqual(vectorIndexSlotName('embedding', 'b'));
        });

        it('places the re-recreated index back in slot A (A->B->A cycle)', async () => {
            const cosineProject = buildVectorProject({ nLists: 1 });
            const l2Project = buildVectorProject({ metric: 'L2', nLists: 1 });
            const innerProductProject = buildVectorProject({ metric: 'INNER_PRODUCT', nLists: 1 });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            // A (COSINE) -> B (L2) -> A (INNER_PRODUCT)
            await runMigrations(cosineProject);
            await runMigrations(l2Project);
            await runMigrations(innerProductProject);

            const indexes = await db.collection('articles').indexes();
            const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
            expect(vectorIndexes).toHaveLength(1);
            expect(vectorIndexes[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));
            expect((vectorIndexes[0] as VectorIndexDescription).params?.metric).toEqual(
                'innerProduct',
            );
        });

        // -----------------------------------------------------------------------
        // Recreation: other parameter changes
        // -----------------------------------------------------------------------

        it('schedules recreation when the dimension changes', async () => {
            const dim4Project = buildVectorProject({ dimension: 4, nLists: 1 });
            const dim8Project = buildVectorProject({ dimension: 8, nLists: 1 });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            await runMigrations(dim4Project);
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(dim8Project.getModel());
            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
        });

        it('schedules recreation when sparse flag changes', async () => {
            const nonSparseProject = buildVectorProject({ dimension: 4, nLists: 1, sparse: false });
            const sparseProject = buildVectorProject({ dimension: 4, nLists: 1, sparse: true });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            await runMigrations(nonSparseProject);
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(sparseProject.getModel());
            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
        });

        it('schedules recreation when pinned nLists changes', async () => {
            const nLists1Project = buildVectorProject({ dimension: 4, nLists: 1 });
            const nLists2Project = buildVectorProject({ dimension: 4, nLists: 2 });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            await runMigrations(nLists1Project);
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(nLists2Project.getModel());
            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
        });

        // -----------------------------------------------------------------------
        // nLists auto-computation: drift threshold
        // -----------------------------------------------------------------------

        it('does not schedule recreation for nLists drift without a threshold configured', async () => {
            // Use nLists: 1 to ensure the index exists; then switch to auto-computed
            const pinnedProject = buildVectorProject({ dimension: 4, nLists: 1 });
            const autoProject = buildVectorProject({ dimension: 4 });
            const db = getTempDatabase();
            // Insert enough docs so auto-computed nLists diverges from 1
            await seedArticles(db, 20);

            await runMigrations(pinnedProject);
            const analyzer = makeAnalyzer(); // no vectorIndexNListsRebuildThreshold
            const migrations = await analyzer.getVectorIndexMigrations(autoProject.getModel());
            // Without a threshold, nLists drift never triggers recreation
            const recreateMigrations = migrations.filter(
                (m) => m instanceof RecreateVectorIndexMigration,
            );
            expect(recreateMigrations).toHaveLength(0);
        });

        it('schedules recreation when auto-computed nLists drift exceeds configured threshold', async () => {
            const pinnedProject = buildVectorProject({ dimension: 4, nLists: 1 });
            const autoProject = buildVectorProject({ dimension: 4 });
            const db = getTempDatabase();
            // Insert enough docs so auto-computed nLists >> 1, well beyond 10% threshold
            await seedArticles(db, 50);
            await runMigrations(pinnedProject);

            // Now use an analyzer with a low rebuild threshold
            const thresholdAnalyzer = makeAnalyzer({ vectorIndexNListsRebuildThreshold: 0.1 });
            const migrations = await thresholdAnalyzer.getVectorIndexMigrations(
                autoProject.getModel(),
            );
            const recreateMigrations = migrations.filter(
                (m) => m instanceof RecreateVectorIndexMigration,
            );
            expect(recreateMigrations).toHaveLength(1);
        });

        // -----------------------------------------------------------------------
        // Drop when removed from model
        // -----------------------------------------------------------------------

        it('schedules DropVectorIndexMigration when a vector index is removed from the model', async () => {
            const withIndexProject = buildVectorProject({ nLists: 1 });
            const withoutIndexProject = buildProject(gql`
                type Article @rootEntity {
                    embedding: [Float]
                }
            `);
            const db = getTempDatabase();
            await seedArticles(db);

            await runMigrations(withIndexProject);
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(
                withoutIndexProject.getModel(),
            );
            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(DropVectorIndexMigration);
        });

        it('is stable (no migrations) after the index is dropped', async () => {
            const withIndexProject = buildVectorProject({ nLists: 1 });
            const withoutIndexProject = buildProject(gql`
                type Article @rootEntity {
                    embedding: [Float]
                }
            `);
            const db = getTempDatabase();
            await seedArticles(db);

            await runMigrations(withIndexProject);
            await runMigrations(withoutIndexProject);

            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(
                withoutIndexProject.getModel(),
            );
            expect(migrations).toHaveLength(0);
        });

        // -----------------------------------------------------------------------
        // Recovery: both A and B slots present (aborted recreation)
        // -----------------------------------------------------------------------

        it('schedules DropVectorIndexMigration for B when both A and B are present (stuck recreation)', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            // Create the normal slot-A index
            await runMigrations(project);

            // Simulate a stuck recreation by manually creating slot B directly in ArangoDB
            await ensureSlotIndex(db, 'b', 'cosine');

            // Now the analyzer should detect the stuck state and produce exactly one DropVectorIndexMigration for B
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
            expect(migrations).toHaveLength(1);
            const [m] = migrations;
            expect(m).toBeInstanceOf(DropVectorIndexMigration);
            if (m instanceof DropVectorIndexMigration) {
                expect(m.index.name).toEqual(vectorIndexSlotName('embedding', 'b'));
            }
        });

        it('finds the DropIndex migration for B, runs it, and confirms B is gone', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            // Step 1: run migrations – slot A is created, system is stable
            await runMigrations(project);

            // Step 2: manually inject a slot B index to simulate an aborted recreation
            await ensureSlotIndex(db, 'b', 'cosine');

            // Verify both slots are present before cleanup
            const beforeVector = await getVectorIndexes(db);
            expect(beforeVector).toHaveLength(2);

            // Step 3: the analyzer must find exactly one DropVectorIndexMigration targeting slot B
            const analyzer = makeAnalyzer();
            const performer = makePerformer();
            const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
            expect(migrations).toHaveLength(1);
            const [drop] = migrations;
            expect(drop).toBeInstanceOf(DropVectorIndexMigration);
            expect((drop as DropVectorIndexMigration).index.name).toEqual(
                vectorIndexSlotName('embedding', 'b'),
            );

            // Step 4: run that specific migration explicitly
            await performer.performMigration(drop);

            // Step 5: verify slot B is gone and slot A still exists
            const afterVector = await getVectorIndexes(db);
            expect(afterVector).toHaveLength(1);
            expect(afterVector[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));

            // Step 6: no further migrations needed
            const remaining = await analyzer.getVectorIndexMigrations(project.getModel());
            expect(remaining).toHaveLength(0);
        });

        it('is stable after recovering from a stuck recreation (drop B, keep A)', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            await runMigrations(project);

            // Simulate stuck state: inject a B index
            await ensureSlotIndex(db, 'b', 'cosine');

            // Perform the cleanup migration
            await runMigrations(project);

            // Only A should remain
            const indexes = await db.collection('articles').indexes();
            const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
            expect(vectorIndexes).toHaveLength(1);
            expect(vectorIndexes[0].name).toEqual(vectorIndexSlotName('embedding', 'a'));

            // And the system should now be fully stable
            const analyzer = makeAnalyzer();
            const remaining = await analyzer.getVectorIndexMigrations(project.getModel());
            expect(remaining).toHaveLength(0);
        });

        // Covers the scenario where B was built with the correct params (L2) but the "drop A"
        // step was interrupted, and accounts for an ArangoDB behavioral difference:
        //   < 3.12.9 : ensureIndex() blocks until training is complete -> B is ready immediately
        //   >= 3.12.9 : ensureIndex() returns while training is still ongoing
        // In both cases the final state after training must be: one DropVectorIndexMigration for A,
        // and no spurious RecreateVectorIndexMigration.
        it('when B (correct, L2) matches but A (stale, COSINE) does not - drops A, no spurious recreate', async () => {
            const cosineProject = buildVectorProject({ nLists: 1 });
            const l2Project = buildVectorProject({ metric: 'L2', nLists: 1 });
            const db = getTempDatabase();
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

            // A = COSINE (stale)
            await runMigrations(cosineProject);
            // B = L2 (correct new index; drop of A was interrupted).
            // ensureSlotIndex uses inBackground - on ArangoDB >=3.12.9 B may still be training.
            await ensureSlotIndex(db, 'b', 'l2', 4, 1, true);

            const analyzer = makeAnalyzer();
            const performer = makePerformer();
            const bSlotName = vectorIndexSlotName('embedding', 'b');

            // On ArangoDB >=3.12.9 B may report trainingState != "ready" immediately after creation.
            // The planner must NOT generate any create/recreate migrations during that window.
            const indexesAfterEnsure = await db.collection('articles').indexes();
            const bIndexAfterEnsure = indexesAfterEnsure.find(
                (i: any) => i.name === bSlotName,
            ) as any;
            if (
                bIndexAfterEnsure &&
                'trainingState' in bIndexAfterEnsure &&
                bIndexAfterEnsure.trainingState !== 'ready'
            ) {
                const migrationsDuringTraining = await analyzer.getVectorIndexMigrations(
                    l2Project.getModel(),
                );
                // Planner returns early when B is still training - no create/recreate allowed
                const spurious = migrationsDuringTraining.filter(
                    (m) =>
                        m instanceof RecreateVectorIndexMigration ||
                        m instanceof CreateVectorIndexMigration,
                );
                expect(spurious).toHaveLength(0);
            }

            // Wait for B to finish training (no-op on ArangoDB <3.12.9 where ensureIndex blocks)
            await performer.waitForVectorIndexReady('articles', bSlotName, {
                pollIntervalMs: 100,
            });

            // B is now ready - planner identifies B as correct and schedules Drop A only
            const migrations = await analyzer.getVectorIndexMigrations(l2Project.getModel());
            const dropMigrations = migrations.filter((m) => m instanceof DropVectorIndexMigration);
            const recreateMigrations = migrations.filter(
                (m) => m instanceof RecreateVectorIndexMigration,
            );
            expect(dropMigrations).toHaveLength(1);
            expect((dropMigrations[0] as DropVectorIndexMigration).index.name).toEqual(
                vectorIndexSlotName('embedding', 'a'),
            );
            expect(recreateMigrations).toHaveLength(0);
        });

        it('after recovery (drop A, keep B), system is stable in a single run', async () => {
            const cosineProject = buildVectorProject({ nLists: 1 });
            const l2Project = buildVectorProject({ metric: 'L2', nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            const analyzer = makeAnalyzer();

            // Slot A has COSINE
            await runMigrations(cosineProject);

            // Inject stuck B (L2, sparse=true) - B is the correct new index; drop of A was interrupted
            await ensureSlotIndex(db, 'b', 'l2', 4, 1, true);

            // Wait for B to be fully ready before asking the planner to act.
            // On ArangoDB >=3.12.9, ensureSlotIndex returns while training is still in progress.
            const performer = makePerformer();
            await performer.waitForVectorIndexReady(
                'articles',
                vectorIndexSlotName('embedding', 'b'),
                { pollIntervalMs: 100 },
            );

            // Single run: drop A (stale COSINE), keep B (correct L2)
            await runMigrations(l2Project);

            const indexes = await db.collection('articles').indexes();
            const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
            expect(vectorIndexes).toHaveLength(1);
            expect(vectorIndexes[0].name).toEqual(vectorIndexSlotName('embedding', 'b'));
            expect((vectorIndexes[0] as VectorIndexDescription).params?.metric).toEqual('l2');

            // System is stable after a single run
            const remaining = await analyzer.getVectorIndexMigrations(l2Project.getModel());
            expect(remaining).toHaveLength(0);
        });

        it('when neither A nor B matches required, drops B and schedules recreation of A', async () => {
            // Scenario: both slots exist with the wrong metric; model now requires L2.
            // The stuck-slot detection falls into the "else" branch (B doesn't match, A doesn't
            // match either) -> drop B. Then the main loop sees A (COSINE) for an L2 model and
            // schedules RecreateVectorIndexMigration(A -> slot B).
            const cosineProject = buildVectorProject({ nLists: 1 });
            const l2Project = buildVectorProject({ metric: 'L2', nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            // Create slot A with COSINE
            await runMigrations(cosineProject);
            // Inject slot B also with COSINE (both slots stale for L2 model)
            await ensureSlotIndex(db, 'b', 'cosine', 4, 1);

            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(l2Project.getModel());
            const dropMigrations = migrations.filter((m) => m instanceof DropVectorIndexMigration);
            const recreateMigrations = migrations.filter(
                (m) => m instanceof RecreateVectorIndexMigration,
            );
            // Stuck B (COSINE) is dropped by the stuck-slot handler
            expect(dropMigrations).toHaveLength(1);
            expect((dropMigrations[0] as DropVectorIndexMigration).index.name).toEqual(
                vectorIndexSlotName('embedding', 'b'),
            );
            // A (COSINE) is scheduled for recreation to become L2
            expect(recreateMigrations).toHaveLength(1);
            const recreate = recreateMigrations[0] as RecreateVectorIndexMigration;
            expect(recreate.existingIndex.name).toEqual(vectorIndexSlotName('embedding', 'a'));
            expect(recreate.requiredIndex.params.metric).toEqual('l2');
        });

        it('drops both A and B when the vector index field is removed from the model', async () => {
            // Scenario: a previous recreation was aborted, leaving both A and B in the database.
            // The model is then updated to remove the vector index entirely.
            // Expected: the stuck-slot handler drops B (since !resolved), and the regular drop
            // loop removes A (it is no longer required by the model).
            const cosineProject = buildVectorProject({ nLists: 1 });
            const withoutIndexProject = buildProject(gql`
                type Article @rootEntity {
                    embedding: [Float]
                }
            `);
            const db = getTempDatabase();
            await seedArticles(db);

            // Create slot A
            await runMigrations(cosineProject);
            // Inject slot B to simulate stuck state
            await ensureSlotIndex(db, 'b', 'cosine', 4, 1);

            // With the vector index removed from the model, both slots should be dropped
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(
                withoutIndexProject.getModel(),
            );
            const dropMigrations = migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(dropMigrations).toHaveLength(2);
            const droppedNames = dropMigrations.map(
                (m) => (m as DropVectorIndexMigration).index.name,
            );
            expect(droppedNames).toContain(vectorIndexSlotName('embedding', 'a'));
            expect(droppedNames).toContain(vectorIndexSlotName('embedding', 'b'));
        });

        it('schedules recreation when storedValues change', async () => {
            // storedValues changes require a full index rebuild because the co-located data
            // (stored with each vector in the IVF index) must be rewritten.
            const withoutStoredValues = buildProject(gql`
                type Article @rootEntity {
                    title: String
                    embedding: [Float] @vectorIndex(dimension: 4, defaultNProbe: 10, maxNProbe: 50)
                }
            `);
            const withStoredValues = buildProject(gql`
                type Article @rootEntity {
                    title: String
                    embedding: [Float]
                        @vectorIndex(
                            dimension: 4
                            defaultNProbe: 10
                            maxNProbe: 50
                            storedValues: ["title"]
                        )
                }
            `);
            const db = getTempDatabase();
            await seedArticles(db);

            // Create the initial index (no storedValues)
            await runMigrations(withoutStoredValues);

            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(withStoredValues.getModel());
            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
        });

        // -----------------------------------------------------------------------
        // Performer: dropIndex handles already-gone index gracefully
        // -----------------------------------------------------------------------

        it('performer does not throw when dropping an already-removed index', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            const performer = makePerformer();
            const model = project.getModel();

            await runMigrations(project);

            // Get the index id, then drop the index with the raw API to simulate concurrent removal
            const indexes = await db.collection('articles').indexes();
            const vectorIndex = indexes.find(
                (i): i is VectorIndexDescription => i.type === 'vector',
            );
            expect(vectorIndex).toBeDefined();
            if (!vectorIndex) {
                return; // type guard for TS
            }
            await db.collection('articles').dropIndex(vectorIndex.id);

            // Now perform a DropVectorIndexMigration for the already-gone index - should not throw
            const dropMigration = new DropVectorIndexMigration({
                index: vectorIndex,
                collectionName: 'articles',
            });

            await expect(performer.performMigration(dropMigration)).resolves.not.toThrow();
        });

        // -----------------------------------------------------------------------
        // nLists drift: below threshold
        // -----------------------------------------------------------------------

        it('does not schedule recreation when nLists drift is below the configured threshold', async () => {
            // Create an index with nLists: 1, then switch to auto-computed nLists.
            // With only a few documents, the auto-computed nLists will be small, so
            // the drift from 1 is modest and below a generous threshold.
            const pinnedProject = buildVectorProject({ dimension: 4, nLists: 1 });
            const autoProject = buildVectorProject({ dimension: 4 });
            const db = getTempDatabase();
            // Only 2 documents -> auto-computed nLists = max(1, min(2, round(15*sqrt(2)))) = 2
            // Drift from existing nLists=1: |2-1|/1 = 100%, so use a threshold > 1.0
            // Actually, let's use a large number of docs with nLists close to auto-computed.
            // With 1 doc -> auto nLists = 1 -> 0% drift
            await seedArticles(db, 1);

            await runMigrations(pinnedProject);
            // With 1 doc, auto-computed nLists = max(1, min(1, round(15*1))) = 1
            // Drift: |1-1|/1 = 0%, well below any threshold.
            const thresholdAnalyzer = makeAnalyzer({ vectorIndexNListsRebuildThreshold: 0.25 });
            const migrations = await thresholdAnalyzer.getVectorIndexMigrations(
                autoProject.getModel(),
            );
            const recreateMigrations = migrations.filter(
                (m) => m instanceof RecreateVectorIndexMigration,
            );
            expect(recreateMigrations).toHaveLength(0);
        });

        // -----------------------------------------------------------------------
        // Stuck A+B: both match, both ready - drops B conservatively
        // -----------------------------------------------------------------------

        it('drops B when both A and B match and are ready (tiebreaker)', async () => {
            const project = buildVectorProject({ nLists: 1 });
            const db = getTempDatabase();
            await seedArticles(db);

            // Create slot A via normal migration
            await runMigrations(project);

            // Inject a matching slot B (same params)
            await ensureSlotIndex(db, 'b', 'cosine', 4, 1);

            // Wait for B to be ready
            const performer = makePerformer();
            await performer.waitForVectorIndexReady(
                'articles',
                vectorIndexSlotName('embedding', 'b'),
                { pollIntervalMs: 100 },
            );

            // Analyzer should detect stuck state - both match, both ready
            // Tiebreaker: A was created first (lower numeric ID) -> drop A, keep B
            const analyzer = makeAnalyzer();
            const migrations = await analyzer.getVectorIndexMigrations(project.getModel());

            // Exactly one DropVectorIndexMigration for the lower-ID index (slot A, created first)
            expect(migrations).toHaveLength(1);
            expect(migrations[0]).toBeInstanceOf(DropVectorIndexMigration);
            expect((migrations[0] as DropVectorIndexMigration).index.name).toEqual(
                vectorIndexSlotName('embedding', 'a'),
            );
        });
    },
);

function buildProject(document: DocumentNode): Project {
    return new Project({
        sources: [new ProjectSource('schema.graphql', prettyPrint(document))],
        getExecutionOptions: () => ({ disableAuthorization: true }),
    });
}

function makeAnalyzer(options: Partial<ArangoDBConfig> = {}): SchemaAnalyzer {
    return new SchemaAnalyzer({ ...dbConfig, ...options });
}

function makePerformer(options: Partial<ArangoDBConfig> = {}): MigrationPerformer {
    return new MigrationPerformer({ ...dbConfig, ...options });
}

type VectorProjectOptions = {
    metric?: string;
    dimension?: number;
    nLists?: number;
    sparse?: boolean;
    defaultNProbe?: number;
    maxNProbe?: number;
};

function buildVectorProject(opts: VectorProjectOptions = {}): Project {
    const { metric, dimension = 4, nLists, sparse, defaultNProbe = 10, maxNProbe = 50 } = opts;
    const args: string[] = [];
    if (metric) {
        args.push(`metric: ${metric}`);
    }
    if (dimension !== undefined) {
        args.push(`dimension: ${dimension}`);
    }
    if (nLists !== undefined) {
        args.push(`nLists: ${nLists}`);
    }
    if (sparse !== undefined) {
        args.push(`sparse: ${sparse}`);
    }
    if (defaultNProbe !== undefined) {
        args.push(`defaultNProbe: ${defaultNProbe}`);
    }
    if (maxNProbe !== undefined) {
        args.push(`maxNProbe: ${maxNProbe}`);
    }
    const indexArgs = args.length > 0 ? `(${args.join('\n                        ')})` : '';
    const doc = gql`
        type Article @rootEntity {
            embedding: [Float] @vectorIndex${indexArgs}
        }
    `;
    return buildProject(doc);
}

async function seedArticles(db: any, count = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });
    }
}

async function ensureSlotIndex(
    db: any,
    slot: 'a' | 'b' = 'b',
    metric: 'cosine' | 'l2' | 'innerProduct' = 'cosine',
    dimension = 4,
    nLists = 1,
    sparse = false,
): Promise<void> {
    await (db.collection('articles') as DocumentCollection).ensureIndex({
        type: 'vector',
        name: vectorIndexSlotName('embedding', slot),
        fields: ['embedding'],
        sparse,
        params: { metric, dimension, nLists },
        inBackground: true,
    } as EnsureVectorIndexOptions & {
        // currently missing in arangojs types
        sparse?: boolean;
    });
}

async function getVectorIndexes(db: any): Promise<any[]> {
    const indexes = await db.collection('articles').indexes();
    return indexes.filter((i: any) => i.type === 'vector');
}

async function runMigrations(project: Project, options: Partial<ArangoDBConfig> = {}) {
    const analyzer = makeAnalyzer(options);
    const performer = makePerformer(options);
    const model = project.getModel();
    const migrations = await analyzer.getVectorIndexMigrations(model);
    for (const m of migrations) {
        await performer.performMigration(m);
    }
}
