import type { VectorIndexDescription } from 'arangojs/indexes';
import { DropVectorIndexMigration, type SchemaMigration } from '../migrations.js';
import { vectorIndexNeedsRecreation } from './needs-recreation.js';
import { parseIndexNumericId } from './parse-index-numeric-id.js';
import type { VectorIndexDefinition } from './vector-index-definition.js';
import { VectorIndexState } from './vector-index-status.js';

export interface ResolveStuckSlotsParams {
    readonly slotA: VectorIndexDescription;
    readonly slotB: VectorIndexDescription;
    readonly requiredIndex: VectorIndexDefinition;
    readonly collectionName: string;
    readonly nListsPinned: boolean;
    readonly nListsRebuildThreshold?: number;
    readonly vectorDocumentCount: number;
}

export interface ResolveStuckSlotsResult {
    /** The index that survives after stuck resolution (or undefined if none). */
    survivingIndex: VectorIndexDescription | undefined;
    /** Drop migrations emitted by stuck resolution. */
    migrations: SchemaMigration[];
    /** State determined by stuck resolution. */
    state: VectorIndexState;
    /** The index used for building existingIndexInfo (the one we keep, or the ready one). */
    infoSource: VectorIndexDescription | undefined;
}

/**
 * Resolves the "stuck" dual-slot state where both A and B vector indexes exist.
 *
 * Vector indexes use an A/B slot naming scheme for zero-downtime recreation: the new
 * index is created in the opposite slot while the old one continues serving queries.
 * Normally the old slot is dropped once the new one is ready, but if the process is
 * interrupted (e.g. server restart), both slots remain. This function decides which
 * slot to keep and which to drop.
 *
 * Decision rules (evaluated in order):
 *
 * 1. If exactly one slot matches the model and is ready, drop the other.
 * 2. If both match and are ready, break the tie by dropping the one with the
 *    lower numeric ArangoDB index ID (older index). Fallback: drop B.
 * 3. If both match but one is still training, report RETRAINING (no action).
 * 4. If the matching slot is still training, report TRAINING (wait).
 * 5. If neither matches, drop B and let the caller (evaluateSingleIndex)
 *    handle recreation from A.
 *
 * The caller (computeVectorIndexStatus) uses the returned `survivingIndex` to
 * feed into evaluateSingleIndex for the create/recreate decision.
 */
export function resolveStuckSlots(params: ResolveStuckSlotsParams): ResolveStuckSlotsResult {
    const {
        slotA,
        slotB,
        requiredIndex,
        collectionName,
        nListsPinned,
        nListsRebuildThreshold,
        vectorDocumentCount,
    } = params;

    const aMatches = !vectorIndexNeedsRecreation({
        existing: slotA,
        required: requiredIndex,
        nListsPinned,
        nListsRebuildThreshold,
    });
    const bMatches = !vectorIndexNeedsRecreation({
        existing: slotB,
        required: requiredIndex,
        nListsPinned,
        nListsRebuildThreshold,
    });
    const aReady = isIndexReady(slotA);
    const bReady = isIndexReady(slotB);

    // Revised rule: to drop slot X, the other slot (the keeper) must be ready.
    // If the keeper is still training, do nothing.

    if (bMatches && bReady && !aMatches) {
        // Drop A (A doesn't match, B matches and is ready) - regardless of A's training state
        return {
            survivingIndex: slotB,
            migrations: [
                new DropVectorIndexMigration({
                    indexName: slotA.name,
                    collectionName,
                }),
            ],
            state: VectorIndexState.STUCK_CLEANUP,
            infoSource: slotB,
        };
    }

    if (bMatches && !bReady && !aMatches) {
        // B matches but is still training, A doesn't match - wait
        return {
            survivingIndex: undefined,
            migrations: [],
            state: VectorIndexState.TRAINING,
            infoSource: slotB,
        };
    }

    if (aMatches && bMatches && aReady && bReady) {
        // Both match, both ready -> tiebreaker (drop the older index by numeric ID)
        const { toDrop, toKeep } = resolveTiebreaker(slotA, slotB);
        return {
            survivingIndex: toKeep,
            migrations: [
                new DropVectorIndexMigration({
                    indexName: toDrop.name,
                    collectionName,
                }),
            ],
            state: VectorIndexState.STUCK_CLEANUP,
            infoSource: toKeep,
        };
    }

    if (aMatches && bMatches) {
        // Both match but not both ready - one is training -> RETRAINING
        return {
            survivingIndex: aReady ? slotA : slotB,
            migrations: [],
            state: VectorIndexState.RETRAINING,
            infoSource: aReady ? slotA : slotB,
        };
    }

    // At this point at least one of A/B does not match. We handled the case where B matches above.
    // Remaining cases: A matches (and B doesn't), or neither matches.

    if (aMatches && aReady) {
        // A matches and is ready - drop B (regardless of B's training state)
        return {
            survivingIndex: slotA,
            migrations: [
                new DropVectorIndexMigration({
                    indexName: slotB.name,
                    collectionName,
                }),
            ],
            state: VectorIndexState.STUCK_CLEANUP,
            infoSource: slotA,
        };
    }

    if (aMatches && !aReady) {
        // A matches but is still training, B doesn't match - wait for A
        // However, if B is ready, B can serve queries (even though it doesn't match).
        // Conservative: still wait for A to finish training.
        if (bReady) {
            // A matches and is training, B doesn't match but is ready.
            // Can't serve correct results from B. Wait for A.
            return {
                survivingIndex: undefined,
                migrations: [],
                state: VectorIndexState.TRAINING,
                infoSource: slotA,
            };
        }
        // Neither ready - just wait
        return {
            survivingIndex: undefined,
            migrations: [],
            state: VectorIndexState.TRAINING,
            infoSource: slotA,
        };
    }

    // Neither matches
    if (!aReady) {
        // A is still training - wait
        return {
            survivingIndex: undefined,
            migrations: [],
            state: VectorIndexState.TRAINING,
            infoSource: aReady ? slotA : slotB,
        };
    }

    if (bReady) {
        // Neither matches, both ready -> drop B conservatively, keep A (for step 2 to recreate it)
        return {
            survivingIndex: slotA,
            migrations: [
                new DropVectorIndexMigration({
                    indexName: slotB.name,
                    collectionName,
                }),
            ],
            state: VectorIndexState.STUCK_CLEANUP,
            infoSource: slotA,
        };
    }

    // Neither matches, A ready, B not ready - we can drop B (A is ready and can serve)
    return {
        survivingIndex: slotA,
        migrations: [
            new DropVectorIndexMigration({
                indexName: slotB.name,
                collectionName,
            }),
        ],
        state: VectorIndexState.STUCK_CLEANUP,
        infoSource: slotA,
    };
}

function resolveTiebreaker(
    slotA: VectorIndexDescription,
    slotB: VectorIndexDescription,
): { toDrop: VectorIndexDescription; toKeep: VectorIndexDescription } {
    const numericA = parseIndexNumericId(slotA.id);
    const numericB = parseIndexNumericId(slotB.id);

    if (numericA != null && numericB != null) {
        // Drop the index with the lower numeric ID (keep the newer one)
        if (numericA < numericB) {
            return { toDrop: slotA, toKeep: slotB };
        }
        return { toDrop: slotB, toKeep: slotA };
    }

    // Fallback: drop B (keep A as canonical slot)
    return { toDrop: slotB, toKeep: slotA };
}

function isIndexReady(index: VectorIndexDescription): boolean {
    return index.trainingState === undefined || index.trainingState === 'ready';
}
