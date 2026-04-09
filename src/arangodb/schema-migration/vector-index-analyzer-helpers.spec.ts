import { describe, expect, it } from 'vitest';
import type { VectorIndexDefinition } from './index-helpers.js';
import { vectorIndexNeedsRecreation } from './vector-index-analyzer-helpers.js';

/** Minimal stub for RootEntityType — the function under test never inspects this. */
const stubRootEntity = {} as any;

function makeIndex(
    overrides: Partial<{
        metric: VectorIndexDefinition['params']['metric'];
        dimension: number;
        nLists: number | undefined;
        sparse: boolean;
        storedValues: string[];
    }> = {},
): VectorIndexDefinition {
    return {
        type: 'vector',
        rootEntity: stubRootEntity,
        fields: ['embedding'],
        collectionName: 'foos',
        sparse: overrides.sparse ?? false,
        params: {
            metric: overrides.metric ?? 'cosine',
            dimension: overrides.dimension ?? 128,
            nLists: overrides.nLists,
        },
        storedValues: overrides.storedValues,
    };
}

describe('vectorIndexNeedsRecreation', () => {
    describe('core parameter changes', () => {
        it('returns false when nothing has changed', () => {
            const index = makeIndex({ metric: 'cosine', dimension: 128, nLists: 10 });
            expect(vectorIndexNeedsRecreation(index, index, true)).toBe(false);
        });

        it('returns true when metric changes', () => {
            const existing = makeIndex({ metric: 'cosine' });
            const required = makeIndex({ metric: 'l2' });
            expect(vectorIndexNeedsRecreation(existing, required, true)).toBe(true);
        });

        it('returns true when dimension changes', () => {
            const existing = makeIndex({ dimension: 128 });
            const required = makeIndex({ dimension: 256 });
            expect(vectorIndexNeedsRecreation(existing, required, true)).toBe(true);
        });

        it('returns true when sparse changes from false to true', () => {
            const existing = makeIndex({ sparse: false });
            const required = makeIndex({ sparse: true });
            expect(vectorIndexNeedsRecreation(existing, required, true)).toBe(true);
        });

        it('returns true when sparse changes from true to false', () => {
            const existing = makeIndex({ sparse: true });
            const required = makeIndex({ sparse: false });
            expect(vectorIndexNeedsRecreation(existing, required, false)).toBe(true);
        });
    });

    describe('storedValues changes', () => {
        it('returns false when storedValues are identical', () => {
            const existing = makeIndex({ storedValues: ['foo', 'bar'] });
            const required = makeIndex({ storedValues: ['foo', 'bar'] });
            expect(vectorIndexNeedsRecreation(existing, required, false)).toBe(false);
        });

        it('returns true when storedValues are added', () => {
            const existing = makeIndex({ storedValues: [] });
            const required = makeIndex({ storedValues: ['tenantId'] });
            expect(vectorIndexNeedsRecreation(existing, required, false)).toBe(true);
        });

        it('returns true when storedValues are removed', () => {
            const existing = makeIndex({ storedValues: ['tenantId'] });
            const required = makeIndex({ storedValues: [] });
            expect(vectorIndexNeedsRecreation(existing, required, false)).toBe(true);
        });

        it('treats undefined storedValues as empty', () => {
            const existing = makeIndex({ storedValues: undefined });
            const required = makeIndex({ storedValues: [] });
            expect(vectorIndexNeedsRecreation(existing, required, false)).toBe(false);
        });
    });

    describe('nLists with pinned value', () => {
        it('returns false when nLists matches exactly (pinned)', () => {
            const existing = makeIndex({ nLists: 20 });
            const required = makeIndex({ nLists: 20 });
            expect(vectorIndexNeedsRecreation(existing, required, true)).toBe(false);
        });

        it('returns true when nLists differs (pinned)', () => {
            const existing = makeIndex({ nLists: 20 });
            const required = makeIndex({ nLists: 40 });
            expect(vectorIndexNeedsRecreation(existing, required, true)).toBe(true);
        });
    });

    describe('nLists with auto-computed value (not pinned)', () => {
        it('returns false when no threshold is configured, even if nLists differs', () => {
            const existing = makeIndex({ nLists: 20 });
            const required = makeIndex({ nLists: 40 });
            expect(vectorIndexNeedsRecreation(existing, required, false, undefined)).toBe(false);
        });

        it('returns false when drift is below the threshold', () => {
            const existing = makeIndex({ nLists: 100 });
            const required = makeIndex({ nLists: 115 }); // 15 % drift
            expect(vectorIndexNeedsRecreation(existing, required, false, 0.25)).toBe(false);
        });

        it('returns true when drift exceeds the threshold', () => {
            const existing = makeIndex({ nLists: 100 });
            const required = makeIndex({ nLists: 200 }); // 100 % drift
            expect(vectorIndexNeedsRecreation(existing, required, false, 0.25)).toBe(true);
        });
    });

    describe('missing nLists', () => {
        it('returns false when existing nLists is unknown (no nLists in db)', () => {
            const existing = makeIndex({ nLists: undefined });
            const required = makeIndex({ nLists: 20 });
            expect(vectorIndexNeedsRecreation(existing, required, true)).toBe(false);
        });

        it('returns false when required nLists is not yet resolved', () => {
            const existing = makeIndex({ nLists: 20 });
            const required = makeIndex({ nLists: undefined });
            expect(vectorIndexNeedsRecreation(existing, required, false)).toBe(false);
        });
    });
});
