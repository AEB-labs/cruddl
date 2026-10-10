// noinspection GraphQLUnresolvedReference

import type { VectorIndexDescription, VectorIndexTrainingState } from 'arangojs/indexes';
import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { createSimpleModel } from '../../../testing/utils/create-simple-model.js';
import {
    CreateVectorIndexMigration,
    DropVectorIndexMigration,
    RecreateVectorIndexMigration,
} from '../migrations.js';
import {
    computeVectorIndexStatus,
    type ComputeVectorIndexStatusInput,
} from './compute-vector-index-status.js';
import type { VectorIndexDefinition, VectorIndexSlot } from './vector-index-definition.js';
import { vectorIndexSlotName } from './vector-index-helpers.js';
import { VectorIndexState } from './vector-index-status.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const model = createSimpleModel(gql`
    type Article @rootEntity {
        title: String
        embedding: [Float]
            @vectorIndex(dimension: 4, defaultNProbe: 10, maxNProbe: 50, storedValues: ["title"])
    }
`);

const rootEntity = model.rootEntityTypes.find((r) => r.name === 'Article')!;
const field = rootEntity.fields.find((f) => f.name === 'embedding')!;

function makeExisting(
    slot: VectorIndexSlot,
    overrides: {
        id?: string;
        name?: string;
        metric?: 'cosine' | 'l2' | 'innerProduct';
        dimension?: number;
        nLists?: number;
        sparse?: boolean;
        storedValues?: string[];
        trainingState?: VectorIndexTrainingState;
    } = {},
): VectorIndexDescription {
    const slotName = vectorIndexSlotName('embedding', slot);
    const numericId = slot === 'a' ? 100 : 200;
    return {
        id: overrides.id ?? `articles/${numericId}`,
        name: overrides.name ?? slotName,
        type: 'vector',
        fields: ['embedding'] as [string],
        sparse: 'sparse' in overrides ? overrides.sparse! : true,
        unique: false,
        parallelism: 1,
        inBackground: true,
        params: {
            metric: overrides.metric ?? 'cosine',
            dimension: overrides.dimension ?? 4,
            nLists: 'nLists' in overrides ? overrides.nLists! : 1,
        },
        storedValues: 'storedValues' in overrides ? overrides.storedValues : ['title'],
        trainingState: overrides.trainingState,
    };
}

function makeRequired(
    overrides: {
        metric?: 'cosine' | 'l2' | 'innerProduct';
        dimension?: number;
        nLists?: number;
        sparse?: boolean;
        storedValues?: ReadonlyArray<string>;
    } = {},
): VectorIndexDefinition {
    return {
        fieldName: 'embedding',
        collectionName: 'articles',
        sparse: 'sparse' in overrides ? overrides.sparse! : true,
        params: {
            metric: overrides.metric ?? 'cosine',
            dimension: overrides.dimension ?? 4,
            nLists: 'nLists' in overrides ? overrides.nLists : 1,
        },
        storedValues: 'storedValues' in overrides ? overrides.storedValues : ['title'],
    };
}

function makeInput(
    overrides: Partial<ComputeVectorIndexStatusInput> = {},
): ComputeVectorIndexStatusInput {
    return {
        field,
        existingForField: overrides.existingForField ?? [],
        requiredIndex: overrides.requiredIndex ?? makeRequired(),
        vectorDocumentCount: overrides.vectorDocumentCount ?? 10,
        computedNLists: overrides.computedNLists ?? 1,
        nListsPinned: overrides.nListsPinned ?? true,
        nListsRebuildThreshold: overrides.nListsRebuildThreshold,
        forceRecreate: overrides.forceRecreate ?? false,
    };
}

// ---------------------------------------------------------------------------
// computeVectorIndexStatus
// ---------------------------------------------------------------------------

describe('computeVectorIndexStatus', () => {
    // ----- Single-slot states -----

    describe('no existing index', () => {
        it('returns DEFERRED when vectorDocumentCount is 0', () => {
            const status = computeVectorIndexStatus(
                makeInput({ vectorDocumentCount: 0, existingForField: [] }),
            );
            expect(status.state).toBe(VectorIndexState.DEFERRED);
            expect(status.migrations).toHaveLength(0);
            expect(status.existingIndexInfo).toBeUndefined();
        });

        it('returns NEEDS_CREATE when vectorDocumentCount > 0', () => {
            const status = computeVectorIndexStatus(
                makeInput({ vectorDocumentCount: 10, existingForField: [] }),
            );
            expect(status.state).toBe(VectorIndexState.NEEDS_CREATE);
            expect(status.migrations).toHaveLength(1);
            expect(status.migrations[0]).toBeInstanceOf(CreateVectorIndexMigration);
            const migration = status.migrations[0] as CreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('a');
            expect(migration.vectorDocumentCount).toBe(10);
        });

        it('returns NEEDS_CREATE with forceRecreate and no existing index', () => {
            const status = computeVectorIndexStatus(
                makeInput({
                    vectorDocumentCount: 10,
                    existingForField: [],
                    forceRecreate: true,
                }),
            );
            expect(status.state).toBe(VectorIndexState.NEEDS_CREATE);
            expect(status.migrations).toHaveLength(1);
            expect(status.migrations[0]).toBeInstanceOf(CreateVectorIndexMigration);
        });
    });

    describe('single slot A exists, matches, ready', () => {
        it('returns UP_TO_DATE', () => {
            const existing = makeExisting('a');
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
            expect(status.migrations).toHaveLength(0);
            expect(status.existingIndexInfo).toBeDefined();
            expect(status.existingIndexInfo!.name).toBe(vectorIndexSlotName('embedding', 'a'));
        });
    });

    describe('single slot A exists, matches, training', () => {
        it('returns TRAINING', () => {
            const existing = makeExisting('a', { trainingState: 'training' });
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            expect(status.state).toBe(VectorIndexState.TRAINING);
            expect(status.migrations).toHaveLength(0);
        });
    });

    describe('single slot A exists, does not match', () => {
        it('returns NEEDS_RECREATE with RecreateVectorIndexMigration targeting slot B', () => {
            const existing = makeExisting('a', { metric: 'l2' });
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            expect(status.state).toBe(VectorIndexState.NEEDS_RECREATE);
            expect(status.migrations).toHaveLength(1);
            expect(status.migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
            const migration = status.migrations[0] as RecreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('b');
        });
    });

    describe('single slot B exists, matches, ready', () => {
        it('returns UP_TO_DATE', () => {
            const existing = makeExisting('b');
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
            expect(status.migrations).toHaveLength(0);
        });
    });

    describe('single slot B exists, does not match', () => {
        it('returns NEEDS_RECREATE targeting slot A', () => {
            const existing = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            expect(status.state).toBe(VectorIndexState.NEEDS_RECREATE);
            expect(status.migrations).toHaveLength(1);
            const migration = status.migrations[0] as RecreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('a');
        });
    });

    describe('forceRecreate with existing index', () => {
        it('returns NEEDS_RECREATE even when index matches', () => {
            const existing = makeExisting('a');
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [existing], forceRecreate: true }),
            );
            expect(status.state).toBe(VectorIndexState.NEEDS_RECREATE);
            expect(status.migrations).toHaveLength(1);
            expect(status.migrations[0]).toBeInstanceOf(RecreateVectorIndexMigration);
            const migration = status.migrations[0] as RecreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('b');
        });

        it('forces recreate even when existing index is training', () => {
            const existing = makeExisting('a', { trainingState: 'training' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [existing], forceRecreate: true }),
            );
            expect(status.state).toBe(VectorIndexState.NEEDS_RECREATE);
            expect(status.migrations).toHaveLength(1);
        });
    });

    // ----- Dual-slot (stuck) states -----

    describe('dual-slot: both exist', () => {
        it('A matches ready, B does not match ready -> drops B (STUCK_CLEANUP)', () => {
            const slotA = makeExisting('a');
            const slotB = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.STUCK_CLEANUP);
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'b'),
            );
        });

        it('A does not match ready, B matches ready -> drops A (STUCK_CLEANUP)', () => {
            const slotA = makeExisting('a', { metric: 'l2' });
            const slotB = makeExisting('b');
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.STUCK_CLEANUP);
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'a'),
            );
        });

        it('neither matches, both ready -> drops B, then schedules RecreateVectorIndex for A', () => {
            const slotA = makeExisting('a', { metric: 'l2' });
            const slotB = makeExisting('b', { metric: 'innerProduct' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.STUCK_CLEANUP);
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            const recreates = status.migrations.filter(
                (m) => m instanceof RecreateVectorIndexMigration,
            );
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'b'),
            );
            expect(recreates).toHaveLength(1);
        });

        it('both match, both ready -> tiebreaker drops lower-ID index', () => {
            // A has id articles/100, B has id articles/200
            // A has lower ID -> drop A, keep B
            const slotA = makeExisting('a', { id: 'articles/100' });
            const slotB = makeExisting('b', { id: 'articles/200' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.STUCK_CLEANUP);
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'a'),
            );
        });

        it('tiebreaker: when B has lower ID, drops B', () => {
            const slotA = makeExisting('a', { id: 'articles/200' });
            const slotB = makeExisting('b', { id: 'articles/100' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'b'),
            );
        });

        it('tiebreaker fallback: when IDs cannot be parsed, drops B', () => {
            const slotA = makeExisting('a', { id: 'invalid' });
            const slotB = makeExisting('b', { id: 'also-invalid' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'b'),
            );
        });

        it('both match, A ready B training -> RETRAINING (no migrations)', () => {
            const slotA = makeExisting('a');
            const slotB = makeExisting('b', { trainingState: 'training' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.RETRAINING);
            expect(status.migrations).toHaveLength(0);
        });

        it('both match, A training B ready -> RETRAINING (no migrations)', () => {
            const slotA = makeExisting('a', { trainingState: 'training' });
            const slotB = makeExisting('b');
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.RETRAINING);
            expect(status.migrations).toHaveLength(0);
        });

        it('A matches ready, B does not match training -> drops B', () => {
            const slotA = makeExisting('a');
            const slotB = makeExisting('b', { metric: 'l2', trainingState: 'training' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.STUCK_CLEANUP);
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'b'),
            );
        });

        it('A does not match, B matches training -> TRAINING (wait for B)', () => {
            const slotA = makeExisting('a', { metric: 'l2' });
            const slotB = makeExisting('b', { trainingState: 'training' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.TRAINING);
            expect(status.migrations).toHaveLength(0);
        });

        it('A does not match training, B matches ready -> drops A (B can serve)', () => {
            const slotA = makeExisting('a', { metric: 'l2', trainingState: 'training' });
            const slotB = makeExisting('b');
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.STUCK_CLEANUP);
            const drops = status.migrations.filter((m) => m instanceof DropVectorIndexMigration);
            expect(drops).toHaveLength(1);
            expect((drops[0] as DropVectorIndexMigration).index.name).toBe(
                vectorIndexSlotName('embedding', 'a'),
            );
        });

        it('A training, B does not match -> TRAINING (wait for A)', () => {
            const slotA = makeExisting('a', { trainingState: 'training' });
            const slotB = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.TRAINING);
            expect(status.migrations).toHaveLength(0);
        });

        it('A matches training, B does not match ready -> TRAINING (wait for A)', () => {
            const slotA = makeExisting('a', { trainingState: 'training' });
            const slotB = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.TRAINING);
            expect(status.migrations).toHaveLength(0);
        });

        it('neither matches, A training -> TRAINING', () => {
            const slotA = makeExisting('a', { metric: 'l2', trainingState: 'training' });
            const slotB = makeExisting('b', { metric: 'innerProduct' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            expect(status.state).toBe(VectorIndexState.TRAINING);
            expect(status.migrations).toHaveLength(0);
        });
    });

    // ----- nLists drift -----

    describe('nLists drift', () => {
        it('triggers recreation when auto-computed nLists drift exceeds threshold', () => {
            const existing = makeExisting('a', { nLists: 10 });
            const required = makeRequired({ nLists: 20 } as any);
            const status = computeVectorIndexStatus(
                makeInput({
                    existingForField: [existing],
                    requiredIndex: required,
                    nListsPinned: false,
                    nListsRebuildThreshold: 0.25,
                }),
            );
            expect(status.state).toBe(VectorIndexState.NEEDS_RECREATE);
        });

        it('does not trigger recreation when drift is below threshold', () => {
            const existing = makeExisting('a', { nLists: 10 });
            const required = makeRequired({ nLists: 11 } as any);
            const status = computeVectorIndexStatus(
                makeInput({
                    existingForField: [existing],
                    requiredIndex: required,
                    nListsPinned: false,
                    nListsRebuildThreshold: 0.25,
                }),
            );
            expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
        });

        it('does not trigger recreation without a threshold configured', () => {
            const existing = makeExisting('a', { nLists: 10 });
            const required = makeRequired({ nLists: 100 } as any);
            const status = computeVectorIndexStatus(
                makeInput({
                    existingForField: [existing],
                    requiredIndex: required,
                    nListsPinned: false,
                    nListsRebuildThreshold: undefined,
                }),
            );
            expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
        });
    });

    // ----- Output validation -----

    describe('output properties', () => {
        it('populates rootEntityType, field, vectorIndex, collectionName', () => {
            const status = computeVectorIndexStatus(makeInput({ existingForField: [] }));
            expect(status.rootEntityType.name).toBe('Article');
            expect(status.field.name).toBe('embedding');
            expect(status.vectorIndex).toBeDefined();
            expect(status.collectionName).toBe('articles');
        });

        it('sets vectorDocumentCount and computedNLists', () => {
            const status = computeVectorIndexStatus(
                makeInput({ vectorDocumentCount: 42, computedNLists: 7 }),
            );
            expect(status.vectorDocumentCount).toBe(42);
            expect(status.computedNLists).toBe(7);
        });

        it('sets nListsDrift for auto-computed nLists with existing index', () => {
            const existing = makeExisting('a', { nLists: 10 });
            const status = computeVectorIndexStatus(
                makeInput({
                    existingForField: [existing],
                    computedNLists: 15,
                    nListsPinned: false,
                }),
            );
            expect(status.nListsDrift).toBeCloseTo(0.5);
        });

        it('does not set nListsDrift when nLists is pinned', () => {
            const existing = makeExisting('a', { nLists: 10 });
            const status = computeVectorIndexStatus(
                makeInput({
                    existingForField: [existing],
                    computedNLists: 15,
                    nListsPinned: true,
                }),
            );
            expect(status.nListsDrift).toBeUndefined();
        });

        it('does not set nListsDrift when no existing index', () => {
            const status = computeVectorIndexStatus(
                makeInput({
                    existingForField: [],
                    computedNLists: 15,
                    nListsPinned: false,
                }),
            );
            expect(status.nListsDrift).toBeUndefined();
        });

        it('sets existingIndexInfo when an index exists', () => {
            const existing = makeExisting('a', { trainingState: 'ready' });
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            expect(status.existingIndexInfo).toBeDefined();
            expect(status.existingIndexInfo!.name).toBe(vectorIndexSlotName('embedding', 'a'));
            expect(status.existingIndexInfo!.id).toBe('articles/100');
            expect(status.existingIndexInfo!.metric).toBe('cosine');
            expect(status.existingIndexInfo!.dimension).toBe(4);
            expect(status.existingIndexInfo!.trainingState).toBe('ready');
        });

        it('sets existingIndexInfo from surviving index in dual-slot cleanup', () => {
            const slotA = makeExisting('a');
            const slotB = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB] }),
            );
            // A survives (it matches), B is dropped
            expect(status.existingIndexInfo).toBeDefined();
            expect(status.existingIndexInfo!.name).toBe(vectorIndexSlotName('embedding', 'a'));
        });
    });

    // ----- Migration parameters -----

    describe('migration parameters', () => {
        it('CreateVectorIndexMigration always targets slot A', () => {
            const status = computeVectorIndexStatus(
                makeInput({ vectorDocumentCount: 5, existingForField: [] }),
            );
            const migration = status.migrations[0] as CreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('a');
            expect(migration.vectorDocumentCount).toBe(5);
        });

        it('RecreateVectorIndexMigration targets opposite slot from surviving A', () => {
            const existing = makeExisting('a', { metric: 'l2' });
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            const migration = status.migrations[0] as RecreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('b');
        });

        it('RecreateVectorIndexMigration targets opposite slot from surviving B', () => {
            const existing = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(makeInput({ existingForField: [existing] }));
            const migration = status.migrations[0] as RecreateVectorIndexMigration;
            expect(migration.requiredIndex.slot).toBe('a');
        });

        it('DropVectorIndexMigration identifies the dropped index by name and collection', () => {
            const slotA = makeExisting('a');
            const slotB = makeExisting('b', { metric: 'l2' });
            const status = computeVectorIndexStatus(
                makeInput({ existingForField: [slotA, slotB], vectorDocumentCount: 42 }),
            );
            const drop = status.migrations.find(
                (m) => m instanceof DropVectorIndexMigration,
            ) as DropVectorIndexMigration;
            expect(drop).toBeDefined();
            expect(drop.index.name).toBe(vectorIndexSlotName('embedding', 'b'));
            expect(drop.collectionName).toBe('articles');
        });
    });
});
