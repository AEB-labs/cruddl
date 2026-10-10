import type { VectorIndexDescription } from 'arangojs/indexes';
import {
    CreateVectorIndexMigration,
    RecreateVectorIndexMigration,
    type SchemaMigration,
} from '../migrations.js';
import { vectorIndexNeedsRecreation } from './needs-recreation.js';
import type { VectorIndexDefinition, VectorIndexSlot } from './vector-index-definition.js';
import { getVectorIndexSlot, otherVectorIndexSlot } from './vector-index-helpers.js';
import { VectorIndexState } from './vector-index-status.js';

export interface EvaluateSingleIndexParams {
    readonly survivingIndex: VectorIndexDescription | undefined;
    readonly requiredIndex: VectorIndexDefinition;
    readonly vectorDocumentCount: number;
    readonly nListsPinned: boolean;
    readonly nListsRebuildThreshold?: number;
    readonly forceRecreate: boolean;
}

export interface EvaluateSingleIndexResult {
    readonly state: VectorIndexState;
    readonly migrations: ReadonlyArray<SchemaMigration>;
}

/**
 * Decides what migrations are needed for a single surviving index (or none).
 *
 * This is phase 2 of computeVectorIndexStatus, called after stuck-slot resolution
 * has reduced the indexes to at most one survivor. The decision tree:
 *
 * - No surviving index + empty collection -> DEFERRED (ArangoDB < 3.12.9 throws
 *   when creating a vector index on an empty collection)
 * - No surviving index + has documents -> NEEDS_CREATE (slot A)
 * - Surviving index + forceRecreate -> NEEDS_RECREATE (opposite slot)
 * - Surviving index + parameters changed (metric, dimension, sparse, storedValues,
 *   or nLists drift exceeds threshold) -> NEEDS_RECREATE (opposite slot)
 * - Surviving index + still training -> TRAINING (wait, no migrations)
 * - Surviving index + ready + matches model -> UP_TO_DATE
 */
export function evaluateSingleIndex(params: EvaluateSingleIndexParams): EvaluateSingleIndexResult {
    const {
        survivingIndex,
        requiredIndex,
        vectorDocumentCount,
        nListsPinned,
        nListsRebuildThreshold,
        forceRecreate,
    } = params;

    if (!survivingIndex) {
        // No index exists
        if (vectorDocumentCount === 0) {
            // ArangoDB < 3.12.9 throws if there are no documents yet, so don't return a migration
            return { state: VectorIndexState.DEFERRED, migrations: [] };
        }
        // Has documents - create
        const createIndex: VectorIndexDefinition = { ...requiredIndex, slot: 'a' };
        return {
            state: VectorIndexState.NEEDS_CREATE,
            migrations: [
                new CreateVectorIndexMigration({
                    requiredIndex: createIndex,
                    vectorDocumentCount,
                }),
            ],
        };
    }

    // Index exists
    const survivingSlot = getVectorIndexSlot(survivingIndex.name);
    const oppositeSlot: VectorIndexSlot = survivingSlot ? otherVectorIndexSlot(survivingSlot) : 'b';

    if (forceRecreate) {
        const recreateIndex: VectorIndexDefinition = { ...requiredIndex, slot: oppositeSlot };
        return {
            state: VectorIndexState.NEEDS_RECREATE,
            migrations: [
                new RecreateVectorIndexMigration({
                    existingIndex: survivingIndex,
                    requiredIndex: recreateIndex,
                    vectorDocumentCount,
                }),
            ],
        };
    }

    const needsRecreation = vectorIndexNeedsRecreation({
        existing: survivingIndex,
        required: requiredIndex,
        nListsPinned,
        nListsRebuildThreshold,
    });

    if (needsRecreation) {
        const recreateIndex: VectorIndexDefinition = { ...requiredIndex, slot: oppositeSlot };
        return {
            state: VectorIndexState.NEEDS_RECREATE,
            migrations: [
                new RecreateVectorIndexMigration({
                    existingIndex: survivingIndex,
                    requiredIndex: recreateIndex,
                    vectorDocumentCount,
                }),
            ],
        };
    }

    if (!isIndexReady(survivingIndex)) {
        return { state: VectorIndexState.TRAINING, migrations: [] };
    }

    return { state: VectorIndexState.UP_TO_DATE, migrations: [] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isIndexReady(index: VectorIndexDescription): boolean {
    // Older versions of ArangoDB always block index creation until training is done,
    // so the absence of a trainingState can be treated as "ready".
    return index.trainingState === undefined || index.trainingState === 'ready';
}
