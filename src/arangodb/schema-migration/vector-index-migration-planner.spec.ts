import { describe, expect, it, vi } from 'vitest';
import type { VectorIndexDefinition } from './index-helpers.js';
import { vectorIndexSlotName } from './index-helpers.js';
import {
    CreateVectorIndexMigration,
    DropIndexMigration,
    RecreateVectorIndexMigration,
} from './migrations.js';
import { planVectorIndexMigrationsForField } from './vector-index-migration-planner.js';

const stubRootEntity = {} as any;

function makeIndex(
    slot: 'a' | 'b' | null,
    overrides: Partial<{
        nLists: number;
        trainingState: string;
        metric: VectorIndexDefinition['params']['metric'];
        dimension: number;
    }> = {},
): VectorIndexDefinition {
    return {
        type: 'vector',
        id: slot ? `123${slot}` : undefined,
        name: slot ? vectorIndexSlotName('embedding', slot) : undefined,
        rootEntity: stubRootEntity,
        fields: ['embedding'],
        collectionName: 'articles',
        sparse: false,
        params: {
            metric: overrides.metric ?? 'cosine',
            dimension: overrides.dimension ?? 4,
            nLists: overrides.nLists ?? 10,
        },
        trainingState: overrides.trainingState,
    };
}

/** Common required-index used in most tests */
const required = makeIndex(null, { nLists: 10 });

/** refreshIndicesForStuckCheck that should never be called */
const neverRefresh = vi.fn<() => Promise<ReadonlyArray<VectorIndexDefinition>>>();

/** Default planning options (stuckSlotWaitMs=0 to keep tests fast) */
function opts(
    refreshFn: () => Promise<ReadonlyArray<VectorIndexDefinition>> = neverRefresh,
): Parameters<typeof planVectorIndexMigrationsForField>[3] {
    return {
        nListsPinned: true,
        stuckSlotWaitMs: 0,
        refreshIndicesForStuckCheck: refreshFn,
    };
}

// ---------------------------------------------------------------------------
// No existing indexes
// ---------------------------------------------------------------------------
describe('no existing indexes', () => {
    it('generates CreateVectorIndexMigration when collection has documents', async () => {
        const migrations = await planVectorIndexMigrationsForField([], required, 100, opts());
        expect(migrations).toHaveLength(1);
        expect(migrations[0]).toBeInstanceOf(CreateVectorIndexMigration);
    });

    it('generates nothing when collection is empty', async () => {
        const migrations = await planVectorIndexMigrationsForField([], required, 0, opts());
        expect(migrations).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Only A slot exists
// ---------------------------------------------------------------------------
describe('only A slot', () => {
    it('generates nothing when A matches', async () => {
        const aIndex = makeIndex('a');
        const migrations = await planVectorIndexMigrationsForField([aIndex], required, 100, opts());
        expect(migrations).toHaveLength(0);
    });

    it('generates RecreateVectorIndexMigration when A params differ', async () => {
        const aIndex = makeIndex('a', { metric: 'l2' }); // metric mismatch
        const migrations = await planVectorIndexMigrationsForField([aIndex], required, 100, opts());
        expect(migrations).toHaveLength(1);
        expect(migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
    });
});

// ---------------------------------------------------------------------------
// Stuck A+B: B matches, A does not
// ---------------------------------------------------------------------------
describe('stuck A+B: B matches, A does not', () => {
    it('drops A when B is ready', async () => {
        const aIndex = makeIndex('a', { metric: 'l2', trainingState: 'ready' }); // stale
        const bIndex = makeIndex('b', { trainingState: 'ready' }); // correct

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(),
        );

        expect(migrations).toHaveLength(1);
        expect(migrations[0]).toBeInstanceOf(DropIndexMigration);
        expect((migrations[0] as DropIndexMigration).index.name).toEqual(
            vectorIndexSlotName('embedding', 'a'),
        );
    });

    it('generates RecreateVectorIndexMigration when B is still training', async () => {
        // B (training) is the correct new index, but it's not ready yet.
        // The planner still sees A as the surviving reference and generates a recreation
        // migration for it. When the performer executes this, ensureIndex returns the
        // already-in-progress B (ArangoDB deduplication), waitForVectorIndexReady then
        // blocks until B becomes ready, and the performer drops A. Net result: correct.
        const aIndex = makeIndex('a', { metric: 'l2', trainingState: 'ready' }); // stale
        const bIndex = makeIndex('b', { trainingState: 'training' }); // correct but not ready

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(),
        );

        expect(migrations).toHaveLength(1);
        expect(migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
        expect((migrations[0] as RecreateVectorIndexMigration).existingIndex.name).toEqual(
            vectorIndexSlotName('embedding', 'a'),
        );
    });
});

// ---------------------------------------------------------------------------
// Stuck A+B: both match (parallel migration race)
// ---------------------------------------------------------------------------
describe('stuck A+B: both match (parallel race)', () => {
    it('drops B conservatively when both are still present after the wait', async () => {
        const aIndex = makeIndex('a', { trainingState: 'ready' });
        const bIndex = makeIndex('b', { trainingState: 'ready' });

        // Simulate: both slots still exist after the wait
        const refresh = vi.fn().mockResolvedValue([aIndex, bIndex]);

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(refresh),
        );

        expect(refresh).toHaveBeenCalledOnce();
        expect(migrations).toHaveLength(1);
        expect(migrations[0]).toBeInstanceOf(DropIndexMigration);
        expect((migrations[0] as DropIndexMigration).index.name).toEqual(
            vectorIndexSlotName('embedding', 'b'),
        );
    });

    it('generates nothing when parallel process dropped B before the re-check', async () => {
        const aIndex = makeIndex('a', { trainingState: 'ready' });
        const bIndex = makeIndex('b', { trainingState: 'ready' });

        // Simulate: the other process finished and dropped B before our re-check
        const refresh = vi.fn().mockResolvedValue([aIndex]);

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(refresh),
        );

        expect(refresh).toHaveBeenCalledOnce();
        // No action needed: A is the surviving index and it matches.
        expect(migrations).toHaveLength(0);
    });

    it('generates nothing when both are matching but either is still training', async () => {
        const aIndex = makeIndex('a', { trainingState: 'ready' });
        const bIndex = makeIndex('b', { trainingState: 'training' }); // still training

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(),
        );

        // Neither ready/ready → the wait+refresh path is skipped entirely; leave intact.
        expect(migrations).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Stuck A+B: B does NOT match (A matches or neither matches)
// ---------------------------------------------------------------------------
describe('stuck A+B: B does not match', () => {
    it('drops B when A matches and A is ready', async () => {
        const aIndex = makeIndex('a', { trainingState: 'ready' }); // correct
        const bIndex = makeIndex('b', { metric: 'l2', trainingState: 'ready' }); // wrong

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(),
        );

        expect(migrations).toHaveLength(1);
        expect(migrations[0]).toBeInstanceOf(DropIndexMigration);
        expect((migrations[0] as DropIndexMigration).index.name).toEqual(
            vectorIndexSlotName('embedding', 'b'),
        );
    });

    it('generates nothing when A is still training (cannot safely drop B yet)', async () => {
        const aIndex = makeIndex('a', { trainingState: 'training' }); // not yet usable
        const bIndex = makeIndex('b', { metric: 'l2', trainingState: 'ready' }); // wrong

        const migrations = await planVectorIndexMigrationsForField(
            [aIndex, bIndex],
            required,
            100,
            opts(),
        );

        // A is not confirmed ready — wait for next run before dropping B.
        expect(migrations).toHaveLength(0);
    });
});
