import type { VectorIndexDescription, VectorIndexTrainingState } from 'arangojs/indexes';
import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { createSimpleModel } from '../../../testing/utils/create-simple-model.js';
import { vectorIndexNeedsRecreation } from './needs-recreation.js';
import type { VectorIndexDefinition, VectorIndexSlot } from './vector-index-definition.js';
import { vectorIndexSlotName } from './vector-index-helpers.js';

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
        fieldName: ['embedding'] as [string],
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

// ---------------------------------------------------------------------------
// vectorIndexNeedsRecreation
// ---------------------------------------------------------------------------

describe('vectorIndexNeedsRecreation', () => {
    it('returns false when all parameters match', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a'),
                required: makeRequired(),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(false);
    });

    it('returns true when metric differs', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { metric: 'cosine' }),
                required: makeRequired({ metric: 'l2' } as any),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(true);
    });

    it('returns true when dimension differs', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { dimension: 4 }),
                required: makeRequired({ dimension: 8 } as any),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(true);
    });

    it('returns true when sparse flag differs', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { sparse: true }),
                required: makeRequired({ sparse: false }),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(true);
    });

    it('returns true when storedValues differ', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { storedValues: ['title'] }),
                required: makeRequired({ storedValues: ['other'] }),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(true);
    });

    it('returns true when storedValues added', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { storedValues: undefined }),
                required: makeRequired({ storedValues: ['title'] }),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(true);
    });

    it('treats storedValues undefined and empty array as equal', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { storedValues: undefined }),
                required: makeRequired({ storedValues: [] }),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(false);
    });

    it('ignores storedValues order', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { storedValues: ['b', 'a'] }),
                required: makeRequired({ storedValues: ['a', 'b'] }),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(false);
    });

    it('returns true when pinned nLists changes', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { nLists: 10 }),
                required: makeRequired({ nLists: 20 } as any),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(true);
    });

    it('returns false when pinned nLists match', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { nLists: 10 }),
                required: makeRequired({ nLists: 10 } as any),
                nListsPinned: true,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(false);
    });

    it('returns true for auto-computed nLists when drift exceeds threshold', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { nLists: 10 }),
                required: makeRequired({ nLists: 15 } as any),
                nListsPinned: false,
                nListsRebuildThreshold: 0.25,
            }),
        ).toBe(true);
    });

    it('returns false for auto-computed nLists when drift is below threshold', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { nLists: 10 }),
                required: makeRequired({ nLists: 11 } as any),
                nListsPinned: false,
                nListsRebuildThreshold: 0.25,
            }),
        ).toBe(false);
    });

    it('returns false for auto-computed nLists when no threshold is configured', () => {
        expect(
            vectorIndexNeedsRecreation({
                existing: makeExisting('a', { nLists: 10 }),
                required: makeRequired({ nLists: 100 } as any),
                nListsPinned: false,
                nListsRebuildThreshold: undefined,
            }),
        ).toBe(false);
    });
});
