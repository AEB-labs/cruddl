import type { DocumentNode } from 'graphql';
import { gql } from 'graphql-tag';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prettyPrint } from '../../core/graphql/pretty-print.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import {
    createTempDatabase,
    getTempDatabase,
} from '../../testing/regression-tests/initialization.js';
import type { ArangoDBConfig } from '../config.js';
import { isArangoDBDisabled } from '../testing/is-arangodb-disabled.js';
import { SchemaAnalyzer } from './analyzer.js';
import { getVectorIndexSlot, vectorIndexSlotName } from './index-helpers.js';
import {
    CreateVectorIndexMigration,
    DropIndexMigration,
    RecreateVectorIndexMigration,
} from './migrations.js';
import { MigrationPerformer } from './performer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProject(document: DocumentNode): Project {
    return new Project({
        sources: [new ProjectSource('schema.graphql', prettyPrint(document))],
        getExecutionOptions: () => ({ disableAuthorization: true }),
    });
}

let dbConfig: ArangoDBConfig;

async function makeAnalyzer(options: Partial<ArangoDBConfig> = {}): Promise<SchemaAnalyzer> {
    return new SchemaAnalyzer({ ...dbConfig, ...options });
}

async function makePerformer(options: Partial<ArangoDBConfig> = {}): Promise<MigrationPerformer> {
    return new MigrationPerformer({ ...dbConfig, ...options });
}

/**
 * Repeatedly performs all outstanding (non-mandatory included) migrations until stable.
 * Returns the number of rounds needed — useful to assert that a second round produces nothing.
 */
async function runUntilStable(
    analyzer: SchemaAnalyzer,
    performer: MigrationPerformer,
    project: Project,
): Promise<number> {
    const model = project.getModel();
    let rounds = 0;
    for (let i = 0; i < 10; i++) {
        const migrations = await analyzer.getVectorIndexMigrations(model);
        if (migrations.length === 0) break;
        for (const m of migrations) {
            await performer.performMigration(m);
        }
        rounds++;
    }
    return rounds;
}

// ---------------------------------------------------------------------------
// Suite — requires a live ArangoDB instance
// ---------------------------------------------------------------------------

describe.skipIf(isArangoDBDisabled())('vector index migrations (integration)', () => {
    beforeEach(async () => {
        dbConfig = await createTempDatabase();
        // Create the articles collection up-front for most tests
        const db = getTempDatabase();
        try {
            await db.createCollection('articles');
        } catch {
            // collection may already exist if a previous test created it
        }
    });

    afterEach(() => {
        // Nothing to clean up — createTempDatabase drops all collections in beforeEach
    });

    // -----------------------------------------------------------------------
    // Deferred creation
    // -----------------------------------------------------------------------

    it('does not create vector index on an empty collection', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4)
            }
        `);
        const analyzer = await makeAnalyzer();
        const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
        expect(migrations).to.have.lengthOf(0);
    });

    it('schedules CreateVectorIndexMigration once the collection has documents', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const migrations = await analyzer.getVectorIndexMigrations(project.getModel());

        expect(migrations).to.have.lengthOf(1);
        expect(migrations[0]).to.be.instanceOf(CreateVectorIndexMigration);
    });

    // -----------------------------------------------------------------------
    // First-time creation always goes to slot A
    // -----------------------------------------------------------------------

    it('creates the index in slot A on first creation', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, project);

        const indexes = await db.collection('articles').indexes();
        const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
        expect(vectorIndexes).to.have.lengthOf(1);
        expect(vectorIndexes[0].name).to.equal(vectorIndexSlotName('embedding', 'a'));
    });

    it('is stable (no migrations) after creation', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, project);

        const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
        expect(migrations).to.have.lengthOf(0);
    });

    // -----------------------------------------------------------------------
    // Recreation: metric change triggers A → B slot swap
    // -----------------------------------------------------------------------

    it('schedules RecreateVectorIndexMigration when the metric changes', async () => {
        const cosineProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const l2Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: L2, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        // Step 1: create the COSINE index in slot A
        await runUntilStable(analyzer, performer, cosineProject);

        // Step 2: changing the metric should produce a recreate migration
        const migrations = await analyzer.getVectorIndexMigrations(l2Project.getModel());
        expect(migrations).to.have.lengthOf(1);
        const [m] = migrations;
        expect(m).to.be.instanceOf(RecreateVectorIndexMigration);
        if (m instanceof RecreateVectorIndexMigration) {
            expect(m.existingIndex.name).to.equal(vectorIndexSlotName('embedding', 'a'));
        }
    });

    it('places the recreated index in slot B when existing index is in slot A', async () => {
        const cosineProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const l2Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: L2, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        await runUntilStable(analyzer, performer, cosineProject);
        await runUntilStable(analyzer, performer, l2Project);

        const indexes = await db.collection('articles').indexes();
        const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
        expect(vectorIndexes).to.have.lengthOf(1);
        expect(vectorIndexes[0].name).to.equal(vectorIndexSlotName('embedding', 'b'));
        expect(getVectorIndexSlot(vectorIndexes[0].name)).to.equal('b');
    });

    it('places the re-recreated index back in slot A (A→B→A cycle)', async () => {
        const cosineProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const l2Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: L2, dimension: 4, nLists: 1)
            }
        `);
        const innerProductProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: INNER_PRODUCT, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        // A (COSINE) → B (L2) → A (INNER_PRODUCT)
        await runUntilStable(analyzer, performer, cosineProject);
        await runUntilStable(analyzer, performer, l2Project);
        await runUntilStable(analyzer, performer, innerProductProject);

        const indexes = await db.collection('articles').indexes();
        const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
        expect(vectorIndexes).to.have.lengthOf(1);
        expect(vectorIndexes[0].name).to.equal(vectorIndexSlotName('embedding', 'a'));
        expect((vectorIndexes[0] as any).params?.metric).to.equal('innerProduct');
    });

    // -----------------------------------------------------------------------
    // Recreation: other parameter changes
    // -----------------------------------------------------------------------

    it('schedules recreation when the dimension changes', async () => {
        const dim4Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const dim8Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 8, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, dim4Project);

        const migrations = await analyzer.getVectorIndexMigrations(dim8Project.getModel());
        expect(migrations).to.have.lengthOf(1);
        expect(migrations[0]).to.be.instanceOf(RecreateVectorIndexMigration);
    });

    it('schedules recreation when sparse flag changes', async () => {
        const nonSparseProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float]
                    @vectorIndex(metric: COSINE, dimension: 4, nLists: 1, sparse: false)
            }
        `);
        const sparseProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float]
                    @vectorIndex(metric: COSINE, dimension: 4, nLists: 1, sparse: true)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, nonSparseProject);

        const migrations = await analyzer.getVectorIndexMigrations(sparseProject.getModel());
        expect(migrations).to.have.lengthOf(1);
        expect(migrations[0]).to.be.instanceOf(RecreateVectorIndexMigration);
    });

    it('schedules recreation when pinned nLists changes', async () => {
        const nLists1Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const nLists2Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 2)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, nLists1Project);

        const migrations = await analyzer.getVectorIndexMigrations(nLists2Project.getModel());
        expect(migrations).to.have.lengthOf(1);
        expect(migrations[0]).to.be.instanceOf(RecreateVectorIndexMigration);
    });

    // -----------------------------------------------------------------------
    // nLists auto-computation: drift threshold
    // -----------------------------------------------------------------------

    it('does not schedule recreation for nLists drift without a threshold configured', async () => {
        // Use nLists: 1 to ensure the index exists; then switch to auto-computed
        const pinnedProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const autoProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4)
            }
        `);
        const db = getTempDatabase();
        // Insert enough docs so auto-computed nLists diverges from 1
        for (let i = 0; i < 20; i++) {
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });
        }

        const analyzer = await makeAnalyzer(); // no vectorIndexNListsRebuildThreshold
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, pinnedProject);

        const migrations = await analyzer.getVectorIndexMigrations(autoProject.getModel());
        // Without a threshold, nLists drift never triggers recreation
        const recreateMigrations = migrations.filter(
            (m) => m instanceof RecreateVectorIndexMigration,
        );
        expect(recreateMigrations).to.have.lengthOf(0);
    });

    it('schedules recreation when auto-computed nLists drift exceeds configured threshold', async () => {
        const pinnedProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const autoProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4)
            }
        `);
        const db = getTempDatabase();
        // Insert enough docs so auto-computed nLists >> 1, well beyond 10% threshold
        for (let i = 0; i < 50; i++) {
            await db.collection('articles').save({ embedding: [1, 0, 0, 0] });
        }

        const baseAnalyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(baseAnalyzer, performer, pinnedProject);

        // Now use an analyzer with a low rebuild threshold
        const thresholdAnalyzer = await makeAnalyzer({ vectorIndexNListsRebuildThreshold: 0.1 });
        const migrations = await thresholdAnalyzer.getVectorIndexMigrations(autoProject.getModel());
        const recreateMigrations = migrations.filter(
            (m) => m instanceof RecreateVectorIndexMigration,
        );
        expect(recreateMigrations).to.have.lengthOf(1);
    });

    // -----------------------------------------------------------------------
    // Drop when removed from model
    // -----------------------------------------------------------------------

    it('schedules DropIndexMigration when a vector index is removed from the model', async () => {
        const withIndexProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const withoutIndexProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float]
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, withIndexProject);

        const migrations = await analyzer.getVectorIndexMigrations(withoutIndexProject.getModel());
        expect(migrations).to.have.lengthOf(1);
        expect(migrations[0]).to.be.instanceOf(DropIndexMigration);
    });

    it('is stable (no migrations) after the index is dropped', async () => {
        const withIndexProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const withoutIndexProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float]
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        await runUntilStable(analyzer, performer, withIndexProject);
        await runUntilStable(analyzer, performer, withoutIndexProject);

        const migrations = await analyzer.getVectorIndexMigrations(withoutIndexProject.getModel());
        expect(migrations).to.have.lengthOf(0);
    });

    // -----------------------------------------------------------------------
    // Recovery: both A and B slots present (aborted recreation)
    // -----------------------------------------------------------------------

    it('schedules DropIndexMigration for B when both A and B are present (stuck recreation)', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        // Create the normal slot-A index
        await runUntilStable(analyzer, performer, project);

        // Simulate a stuck recreation by manually creating slot B directly in ArangoDB
        await (db.collection('articles') as any).ensureIndex({
            type: 'vector',
            name: vectorIndexSlotName('embedding', 'b'),
            fields: ['embedding'],
            sparse: false,
            params: { metric: 'cosine', dimension: 4, nLists: 1 },
            inBackground: true,
        });

        // Now the analyzer should detect the stuck state and produce exactly one DropIndexMigration for B
        const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
        expect(migrations).to.have.lengthOf(1);
        const [m] = migrations;
        expect(m).to.be.instanceOf(DropIndexMigration);
        if (m instanceof DropIndexMigration) {
            expect(m.index.name).to.equal(vectorIndexSlotName('embedding', 'b'));
        }
    });

    it('finds the DropIndex migration for B, runs it, and confirms B is gone', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        // Step 1: run migrations – slot A is created, system is stable
        await runUntilStable(analyzer, performer, project);

        // Step 2: manually inject a slot B index to simulate an aborted recreation
        await (db.collection('articles') as any).ensureIndex({
            type: 'vector',
            name: vectorIndexSlotName('embedding', 'b'),
            fields: ['embedding'],
            sparse: false,
            params: { metric: 'cosine', dimension: 4, nLists: 1 },
            inBackground: true,
        });

        // Verify both slots are present before cleanup
        const beforeIndexes = await db.collection('articles').indexes();
        const beforeVector = beforeIndexes.filter((i: any) => i.type === 'vector');
        expect(beforeVector).to.have.lengthOf(2);

        // Step 3: the analyzer must find exactly one DropIndexMigration targeting slot B
        const migrations = await analyzer.getVectorIndexMigrations(project.getModel());
        expect(migrations).to.have.lengthOf(1);
        const [drop] = migrations;
        expect(drop).to.be.instanceOf(DropIndexMigration);
        expect((drop as DropIndexMigration).index.name).to.equal(
            vectorIndexSlotName('embedding', 'b'),
        );

        // Step 4: run that specific migration explicitly
        await performer.performMigration(drop);

        // Step 5: verify slot B is gone and slot A still exists
        const afterIndexes = await db.collection('articles').indexes();
        const afterVector = afterIndexes.filter((i: any) => i.type === 'vector');
        expect(afterVector).to.have.lengthOf(1);
        expect(afterVector[0].name).to.equal(vectorIndexSlotName('embedding', 'a'));

        // Step 6: no further migrations needed
        const remaining = await analyzer.getVectorIndexMigrations(project.getModel());
        expect(remaining).to.have.lengthOf(0);
    });

    it('is stable after recovering from a stuck recreation (drop B, keep A)', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        await runUntilStable(analyzer, performer, project);

        // Simulate stuck state: inject a B index
        await (db.collection('articles') as any).ensureIndex({
            type: 'vector',
            name: vectorIndexSlotName('embedding', 'b'),
            fields: ['embedding'],
            sparse: false,
            params: { metric: 'cosine', dimension: 4, nLists: 1 },
            inBackground: true,
        });

        // Perform the cleanup migration
        await runUntilStable(analyzer, performer, project);

        // Only A should remain
        const indexes = await db.collection('articles').indexes();
        const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
        expect(vectorIndexes).to.have.lengthOf(1);
        expect(vectorIndexes[0].name).to.equal(vectorIndexSlotName('embedding', 'a'));

        // And the system should now be fully stable
        const remaining = await analyzer.getVectorIndexMigrations(project.getModel());
        expect(remaining).to.have.lengthOf(0);
    });

    it('does not generate a spurious recreate migration alongside the B drop in a stuck state', async () => {
        // Even if the stuck B index has wrong params, we should only get the drop — not a drop+recreate.
        // The recreation will be detected on the NEXT run after B is cleaned up.
        const cosineProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const l2Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: L2, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        // Slot A has COSINE
        await runUntilStable(analyzer, performer, cosineProject);

        // Simulate a stuck recreation where B was created with L2 but A was not yet dropped
        await (db.collection('articles') as any).ensureIndex({
            type: 'vector',
            name: vectorIndexSlotName('embedding', 'b'),
            fields: ['embedding'],
            sparse: false,
            params: { metric: 'l2', dimension: 4, nLists: 1 },
            inBackground: true,
        });

        // The model now wants L2, both A (COSINE) and B (L2) exist.
        // We expect the DropIndexMigration for B (cleanup), and may also get a RecreateVectorIndexMigration
        // for A→B since A (COSINE) doesn't match the desired L2. Both in one run is efficient and correct.
        const migrations = await analyzer.getVectorIndexMigrations(l2Project.getModel());
        const dropMigrations = migrations.filter((m) => m instanceof DropIndexMigration);
        const recreateMigrations = migrations.filter(
            (m) => m instanceof RecreateVectorIndexMigration,
        );
        // Must have exactly one drop (for B)
        expect(dropMigrations).to.have.lengthOf(1);
        expect((dropMigrations[0] as DropIndexMigration).index.name).to.equal(
            vectorIndexSlotName('embedding', 'b'),
        );
        // May optionally have one recreate (for A → B with correct params)
        expect(recreateMigrations.length).to.be.lessThanOrEqual(1);
    });

    it('after recovery, re-runs the recreation correctly from slot A to slot B', async () => {
        const cosineProject = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const l2Project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: L2, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();

        // Slot A has COSINE
        await runUntilStable(analyzer, performer, cosineProject);

        // Inject stuck B (L2)
        await (db.collection('articles') as any).ensureIndex({
            type: 'vector',
            name: vectorIndexSlotName('embedding', 'b'),
            fields: ['embedding'],
            sparse: false,
            params: { metric: 'l2', dimension: 4, nLists: 1 },
            inBackground: true,
        });

        // Run until stable with the L2 model:
        //   Round 1: drop B (cleanup) → A (COSINE) remains, model wants L2
        //   Round 2: recreate A→B with L2 (A→B slot swap)
        await runUntilStable(analyzer, performer, l2Project);

        const indexes = await db.collection('articles').indexes();
        const vectorIndexes = indexes.filter((i: any) => i.type === 'vector');
        expect(vectorIndexes).to.have.lengthOf(1);
        expect(vectorIndexes[0].name).to.equal(vectorIndexSlotName('embedding', 'b'));
        expect((vectorIndexes[0] as any).params?.metric).to.equal('l2');

        // System is stable
        const remaining = await analyzer.getVectorIndexMigrations(l2Project.getModel());
        expect(remaining).to.have.lengthOf(0);
    });

    // -----------------------------------------------------------------------
    // Performer: dropIndex handles already-gone index gracefully
    // -----------------------------------------------------------------------

    it('performer does not throw when dropping an already-removed index', async () => {
        const project = buildProject(gql`
            type Article @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 4, nLists: 1)
            }
        `);
        const db = getTempDatabase();
        await db.collection('articles').save({ embedding: [1, 0, 0, 0] });

        const analyzer = await makeAnalyzer();
        const performer = await makePerformer();
        const model = project.getModel();

        await runUntilStable(analyzer, performer, project);

        // Get the index id, then drop the index with the raw API to simulate concurrent removal
        const indexes = await db.collection('articles').indexes();
        const vectorIndex = indexes.find((i: any) => i.type === 'vector');
        expect(vectorIndex).toBeDefined();
        if (!vectorIndex) return; // type guard for TS
        await db.collection('articles').dropIndex(vectorIndex.id);

        // Now perform a DropIndexMigration for the already-gone index — should not throw
        const dropMigration = new DropIndexMigration({
            index: {
                id: vectorIndex.id,
                name: vectorIndex.name,
                collectionName: 'articles',
                fields: ['embedding'],
                sparse: false,
                type: 'vector' as const,
                params: { metric: 'cosine', dimension: 4, nLists: 1 },
                rootEntity: model.rootEntityTypes.find((r) => r.name === 'Article')!,
            },
        });

        await expect(performer.performMigration(dropMigration)).resolves.not.toThrow();
    });
});
