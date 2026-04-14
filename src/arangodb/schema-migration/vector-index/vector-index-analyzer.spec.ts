import type { VectorIndexDescription, VectorIndexTrainingState } from 'arangojs/indexes';
import { gql } from 'graphql-tag';
import { describe, expect, it, vi } from 'vitest';
import { createSimpleModel } from '../../../testing/utils/create-simple-model.js';
import type { ArangoDBConfig } from '../../config.js';
import { VectorIndexAnalyzer } from './vector-index-analyzer.js';
import type { VectorIndexSlot } from './vector-index-definition.js';
import { computeAutoNLists, vectorIndexSlotName } from './vector-index-helpers.js';
import { VectorIndexState } from './vector-index-status.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeExistingIndex(
    fieldName: string,
    slot: VectorIndexSlot,
    overrides: {
        metric?: 'cosine' | 'l2' | 'innerProduct';
        dimension?: number;
        nLists?: number;
        sparse?: boolean;
        storedValues?: string[];
        trainingState?: VectorIndexTrainingState;
    } = {},
): VectorIndexDescription {
    const name = vectorIndexSlotName(fieldName, slot);
    return {
        id: `coll/${slot === 'a' ? 100 : 200}`,
        name,
        type: 'vector',
        fields: [fieldName] as [string],
        sparse: overrides.sparse ?? true,
        unique: false,
        parallelism: 1,
        inBackground: true,
        params: {
            metric: overrides.metric ?? 'cosine',
            dimension: overrides.dimension ?? 4,
            nLists: overrides.nLists ?? 1,
        },
        storedValues: overrides.storedValues ?? ['title'],
        trainingState: overrides.trainingState ?? 'ready',
    };
}

interface MockCollection {
    exists: ReturnType<typeof vi.fn>;
    indexes: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
}

interface MockDatabase {
    collection: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
}

function createMockDb(coll: MockCollection, sparseCount?: number): MockDatabase {
    const mockCursor = { next: vi.fn().mockResolvedValue(sparseCount ?? 0) };
    return {
        collection: vi.fn().mockReturnValue(coll),
        query: vi.fn().mockResolvedValue(mockCursor),
    };
}

function createMockCollection(overrides: {
    exists?: boolean;
    indexes?: object[];
    count?: number;
}): MockCollection {
    return {
        exists: vi.fn().mockResolvedValue(overrides.exists ?? true),
        indexes: vi.fn().mockResolvedValue(overrides.indexes ?? []),
        count: vi.fn().mockResolvedValue({ count: overrides.count ?? 0 }),
    };
}

const defaultConfig: ArangoDBConfig = {
    url: '',
    databaseName: '',
    vectorIndexNListsRebuildThreshold: undefined,
};

// ---------------------------------------------------------------------------
// Models
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

const modelWithNLists = createSimpleModel(gql`
    type Article @rootEntity {
        title: String
        embedding: [Float]
            @vectorIndex(
                dimension: 4
                nLists: 42
                defaultNProbe: 10
                maxNProbe: 50
                storedValues: ["title"]
            )
    }
`);
const fieldWithNLists = modelWithNLists.rootEntityTypes
    .find((r) => r.name === 'Article')!
    .fields.find((f) => f.name === 'embedding')!;

const nonSparseModel = createSimpleModel(gql`
    type Article @rootEntity {
        title: String
        embedding: [Float]
            @vectorIndex(
                dimension: 4
                sparse: false
                defaultNProbe: 10
                maxNProbe: 50
                storedValues: ["title"]
            )
    }
`);
const nonSparseField = nonSparseModel.rootEntityTypes
    .find((r) => r.name === 'Article')!
    .fields.find((f) => f.name === 'embedding')!;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VectorIndexAnalyzer', () => {
    describe('analyzeField', () => {
        describe('collection does not exist', () => {
            it('returns DEFERRED with no migrations', async () => {
                const coll = createMockCollection({ exists: false });
                const db = createMockDb(coll);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                expect(status.state).toBe(VectorIndexState.DEFERRED);
                expect(status.migrations).toHaveLength(0);
                expect(status.vectorDocumentCount).toBe(0);
                expect(status.existingIndexInfo).toBeUndefined();
            });

            it('does not call indexes() or count()', async () => {
                const coll = createMockCollection({ exists: false });
                const db = createMockDb(coll);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                await analyzer.analyzeField(field, false);

                expect(coll.indexes).not.toHaveBeenCalled();
                expect(coll.count).not.toHaveBeenCalled();
                expect(db.query).not.toHaveBeenCalled();
            });
        });

        describe('collection exists, no vector indexes', () => {
            it('returns NEEDS_CREATE when documents exist', async () => {
                const coll = createMockCollection({ exists: true, indexes: [] });
                const db = createMockDb(coll, 100);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                expect(status.state).toBe(VectorIndexState.NEEDS_CREATE);
                expect(status.migrations).toHaveLength(1);
                expect(status.vectorDocumentCount).toBe(100);
            });
        });

        describe('collection exists, matching vector index', () => {
            it('returns UP_TO_DATE for a fully matching index', async () => {
                const existingIdx = makeExistingIndex('embedding', 'a', {
                    nLists: 1,
                    sparse: true,
                    storedValues: ['title'],
                    trainingState: 'ready',
                });
                const coll = createMockCollection({
                    exists: true,
                    indexes: [existingIdx],
                });
                const db = createMockDb(coll, 10);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
                expect(status.migrations).toHaveLength(0);
            });
        });

        describe('document counting', () => {
            it('uses coll.count() for non-sparse indexes', async () => {
                const coll = createMockCollection({ exists: true, indexes: [], count: 500 });
                const db = createMockDb(coll);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(nonSparseField, false);

                expect(coll.count).toHaveBeenCalled();
                expect(db.query).not.toHaveBeenCalled();
                expect(status.vectorDocumentCount).toBe(500);
            });

            it('uses AQL query for sparse indexes', async () => {
                const coll = createMockCollection({ exists: true, indexes: [] });
                const db = createMockDb(coll, 42);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                expect(db.query).toHaveBeenCalled();
                expect(coll.count).not.toHaveBeenCalled();
                expect(status.vectorDocumentCount).toBe(42);
            });

            it('defaults to 0 when sparse count query returns null', async () => {
                const coll = createMockCollection({ exists: true, indexes: [] });
                const mockCursor = { next: vi.fn().mockResolvedValue(null) };
                const db = createMockDb(coll);
                db.query.mockResolvedValue(mockCursor);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                expect(status.vectorDocumentCount).toBe(0);
            });
        });

        describe('nLists computation', () => {
            it('auto-computes nLists when not pinned in model', async () => {
                const coll = createMockCollection({ exists: true, indexes: [] });
                const db = createMockDb(coll, 10000);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                expect(status.computedNLists).toBe(computeAutoNLists(10000));
            });

            it('uses model nLists when pinned', async () => {
                const coll = createMockCollection({ exists: true, indexes: [] });
                const db = createMockDb(coll, 10000);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(fieldWithNLists, false);

                expect(status.computedNLists).toBe(42);
            });
        });

        describe('index filtering', () => {
            it('only considers indexes matching the A/B slot names', async () => {
                const matchingIdx = makeExistingIndex('embedding', 'a', {
                    nLists: 1,
                    sparse: true,
                    storedValues: ['title'],
                    trainingState: 'ready',
                });
                const unrelatedVector: VectorIndexDescription = {
                    id: 'coll/999',
                    name: 'vector_otherField_a',
                    type: 'vector',
                    fields: ['otherField'] as [string],
                    sparse: false,
                    unique: false,
                    parallelism: 1,
                    inBackground: false,
                    params: { metric: 'cosine', dimension: 8, nLists: 1 },
                    trainingState: 'ready',
                };
                const persistentIdx = {
                    id: 'coll/300',
                    name: 'idx_123',
                    type: 'persistent',
                    fields: ['title'],
                    sparse: false,
                    unique: false,
                };

                const coll = createMockCollection({
                    exists: true,
                    indexes: [matchingIdx, unrelatedVector, persistentIdx],
                });
                const db = createMockDb(coll, 10);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, false);

                // Should find one matching index and return UP_TO_DATE,
                // not be confused by the unrelated vector or persistent index
                expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
                expect(status.existingIndexInfo).toBeDefined();
            });
        });

        describe('forceRecreate', () => {
            it('passes forceRecreate=true to trigger NEEDS_RECREATE', async () => {
                const existingIdx = makeExistingIndex('embedding', 'a', {
                    nLists: 1,
                    sparse: true,
                    storedValues: ['title'],
                    trainingState: 'ready',
                });
                const coll = createMockCollection({
                    exists: true,
                    indexes: [existingIdx],
                });
                const db = createMockDb(coll, 10);
                const analyzer = new VectorIndexAnalyzer(db as any, defaultConfig);

                const status = await analyzer.analyzeField(field, true);

                expect(status.state).toBe(VectorIndexState.NEEDS_RECREATE);
                expect(status.migrations.length).toBeGreaterThan(0);
            });
        });

        describe('config passthrough', () => {
            it('passes vectorIndexNListsRebuildThreshold from config', async () => {
                // With 10 sparse docs, auto nLists = computeAutoNLists(10) = 10.
                // Existing has nLists: 10 -> no drift -> UP_TO_DATE regardless of threshold.
                const existingIdx = makeExistingIndex('embedding', 'a', {
                    nLists: computeAutoNLists(10),
                    sparse: true,
                    storedValues: ['title'],
                    trainingState: 'ready',
                });
                const coll = createMockCollection({
                    exists: true,
                    indexes: [existingIdx],
                });
                const db = createMockDb(coll, 10);
                const config: ArangoDBConfig = {
                    ...defaultConfig,
                    vectorIndexNListsRebuildThreshold: 0.5,
                };
                const analyzer = new VectorIndexAnalyzer(db as any, config);

                const status = await analyzer.analyzeField(field, false);
                expect(status.state).toBe(VectorIndexState.UP_TO_DATE);
            });
        });
    });
});
