/**
 * Shared vector index migration planner.
 *
 * This module contains the per-field migration planning logic that is used by both
 * the `SchemaAnalyzer` (regular scheduled migrations) and the `ArangoDBAdapter`
 * (`recreateVectorIndex` for explicit user-triggered rebuilds).
 *
 * Keeping this logic in one place ensures that A/B slot handling, stuck-slot cleanup
 * and nLists drift thresholds are evaluated identically in both code paths.
 */

import {
    computeAutoNLists,
    getVectorIndexSlot,
    vectorIndexMatchesByField,
    type VectorIndexDefinition,
} from './index-helpers.js';
import {
    CreateVectorIndexMigration,
    DropIndexMigration,
    RecreateVectorIndexMigration,
} from './migrations.js';
import { vectorIndexNeedsRecreation } from './vector-index-analyzer-helpers.js';

export type VectorIndexFieldMigrations = Array<
    CreateVectorIndexMigration | RecreateVectorIndexMigration | DropIndexMigration
>;

/**
 * Plans migrations for a single vector index field.
 *
 * Handles:
 * - **Stuck A/B slot cleanup**: when both the A and B slot exist simultaneously (a previous
 *   recreation was interrupted), the function determines which slot is correct and schedules
 *   a `DropIndexMigration` for the stale one.
 * - **Index creation**: schedules a `CreateVectorIndexMigration` when no index exists yet
 *   and there is data to train on.
 * - **Index recreation**: schedules a `RecreateVectorIndexMigration` when the existing index
 *   is stale (params changed) or when `forceRecreate` is requested.
 *
 * What this function does NOT do:
 * - Drop indexes for fields that have been removed from the model. That is the caller's
 *   responsibility (the `SchemaAnalyzer` handles it in its outer drop loop).
 *
 * @param existingForField  All vector index definitions currently stored in ArangoDB for this
 *                          specific field (typically 0, 1, or at most 2 during A/B recreation).
 * @param requiredIndex     The desired index definition from the model.
 *                          `nLists` must already be resolved (auto-computed or pinned).
 * @param documentCount     Effective document count for nLists auto-computation and for
 *                          deciding whether to skip creation on an empty collection.
 * @param options           Planning options.
 */
export async function planVectorIndexMigrationsForField(
    existingForField: ReadonlyArray<VectorIndexDefinition>,
    requiredIndex: VectorIndexDefinition,
    documentCount: number,
    options: {
        /**
         * Whether the model explicitly pins nLists (true) or relies on auto-computation (false).
         * Affects whether any nLists difference triggers recreation or only if drift exceeds the threshold.
         */
        nListsPinned: boolean;
        /**
         * Fractional threshold for auto-computed nLists drift that triggers a recreate migration.
         * When `undefined`, nLists drift alone never causes a rebuild.
         */
        nListsRebuildThreshold?: number;
        /**
         * Callback to re-fetch the current vector index definitions for this field from the
         * database.  Used by the "both match" ambiguity resolution to verify state after a delay.
         * Only called in the rare case that both A and B slots exist with matching params.
         */
        refreshIndicesForStuckCheck: () => Promise<ReadonlyArray<VectorIndexDefinition>>;
        /**
         * Milliseconds to wait before re-checking state when both A and B slots exist with
         * matching params (the "two runners" race condition). Defaults to 5 000 ms.
         * Set to 0 in tests to keep them fast.
         */
        stuckSlotWaitMs?: number;
    },
): Promise<VectorIndexFieldMigrations> {
    const migrations: VectorIndexFieldMigrations = [];

    const {
        nListsPinned,
        nListsRebuildThreshold,
        refreshIndicesForStuckCheck,
        stuckSlotWaitMs = 5_000,
    } = options;

    // --- Stuck A/B slot detection ---
    //
    // When both the A and B slot of the same field are present simultaneously, a previous
    // recreation was interrupted after the new index was built but before the old one was dropped.
    //
    // Strategy: compare each slot's params against the desired (resolved) index to determine
    // which slot is correct and which is stale.
    //
    //  • B matches, A does not → B is the correct new index. Drop A.
    //  • A matches, B does not (or neither matches) → drop B (keep A as the reference slot).
    //  • Both match → ambiguous; likely a parallel migration just finished. Wait 5 seconds,
    //    re-fetch. If both still exist, drop B conservatively (keep A as canonical).
    //
    // In all cases, only drop a slot if the slot we keep is confirmed ready (trainingState).
    // If the "keeper" slot is still training, leave both intact for the next analysis run.

    const aIndex = existingForField.find(
        (idx) => idx.name != null && getVectorIndexSlot(idx.name) === 'a',
    );
    const bIndex = existingForField.find(
        (idx) => idx.name != null && getVectorIndexSlot(idx.name) === 'b',
    );

    let stuckDropped: VectorIndexDefinition | undefined;

    if (aIndex && bIndex) {
        const aIsReady = !('trainingState' in aIndex) || aIndex.trainingState === 'ready';
        const bIsReady = !('trainingState' in bIndex) || bIndex.trainingState === 'ready';

        const aMatches = !vectorIndexNeedsRecreation(
            aIndex,
            requiredIndex,
            nListsPinned,
            nListsRebuildThreshold,
        );
        const bMatches = !vectorIndexNeedsRecreation(
            bIndex,
            requiredIndex,
            nListsPinned,
            nListsRebuildThreshold,
        );

        if (bMatches && !aMatches) {
            // B is the correct new index (reconstruction completed but drop of A was interrupted).
            if (bIsReady) {
                stuckDropped = aIndex;
                migrations.push(
                    new DropIndexMigration({
                        index: aIndex,
                        collectionSize: documentCount,
                    }),
                );
            } else {
                // B is still training. Leave both slots intact and skip any create/recreate —
                // the next analysis run will clean up once B reports trainingState "ready".
                return migrations;
            }
        } else if (bMatches && aMatches) {
            // Both slots report matching params — most likely a parallel migration instance just
            // finished building B and is about to drop A. Wait briefly before intervening.
            if (aIsReady && bIsReady) {
                await new Promise<void>((resolve) => setTimeout(resolve, stuckSlotWaitMs));
                const refreshed = await refreshIndicesForStuckCheck();
                const aStillExists = refreshed.some((i) => i.name === aIndex.name);
                const bStillExists = refreshed.some((i) => i.name === bIndex.name);
                if (aStillExists && bStillExists) {
                    // State is still ambiguous after the wait — drop B conservatively.
                    stuckDropped = bIndex;
                    migrations.push(
                        new DropIndexMigration({
                            index: bIndex,
                            collectionSize: documentCount,
                        }),
                    );
                }
            }
        } else {
            // B is wrong (or neither matches): drop B if A is ready to use.
            if (aIsReady) {
                stuckDropped = bIndex;
                migrations.push(
                    new DropIndexMigration({
                        index: bIndex,
                        collectionSize: documentCount,
                    }),
                );
            } else {
                // A is still training. Leave B intact for now — the next analysis run will
                // handle cleanup (dropping B, then recreating if necessary) once A is ready.
                return migrations;
            }
        }
    }

    // --- Create / recreate ---
    //
    // After stuck-slot cleanup, at most one index exists for this field. Use it as the
    // "existing" reference for the create/recreate decision.

    const surviving = existingForField.find(
        (idx) => idx !== stuckDropped && vectorIndexMatchesByField(idx, requiredIndex),
    );

    if (!surviving) {
        if (documentCount === 0) {
            // The collection is empty — skip for now. ArangoDB cannot train IVF clusters on an
            // empty collection. The migration will be generated once documents exist.
            return migrations;
        }
        migrations.push(
            new CreateVectorIndexMigration({
                requiredIndex,
                collectionSize: documentCount,
            }),
        );
    } else {
        const needsRecreate = vectorIndexNeedsRecreation(
            surviving,
            requiredIndex,
            nListsPinned,
            nListsRebuildThreshold,
        );

        if (needsRecreate) {
            migrations.push(
                new RecreateVectorIndexMigration({
                    existingIndex: surviving,
                    requiredIndex,
                    collectionSize: documentCount,
                }),
            );
        }
    }

    return migrations;
}

/**
 * Resolves the nLists value for a required index definition.
 *
 * When `nLists` is explicitly set in the model (`params.nLists != null`), that value is returned
 * as-is. Otherwise, an auto-computed value is derived from the current document count using the
 * formula `max(1, min(N, round(15 × sqrt(N))))`.
 *
 * @returns `{ resolvedRequired, nListsPinned }` where `resolvedRequired` has `params.nLists`
 *          guaranteed non-null and `nListsPinned` is `true` when the value came from the model.
 */
export function resolveRequiredVectorIndex(
    required: VectorIndexDefinition,
    documentCount: number,
): { resolvedRequired: VectorIndexDefinition; nListsPinned: boolean } {
    const nListsPinned = required.params.nLists != null;
    const resolvedNLists = required.params.nLists ?? computeAutoNLists(documentCount);
    return {
        resolvedRequired: {
            ...required,
            params: { ...required.params, nLists: resolvedNLists },
        },
        nListsPinned,
    };
}
