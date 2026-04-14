import type { VectorIndexDescription } from 'arangojs/indexes';
import type { Field } from '../../../core/model/implementation/field.js';
import type { RootEntityType } from '../../../core/model/implementation/root-entity-type.js';
import type { VectorIndex } from '../../../core/model/implementation/vector-index.js';
import type { SchemaMigration } from '../migrations.js';
import { evaluateSingleIndex } from './evaluate-single-index.js';
import { resolveStuckSlots } from './resolve-stuck-slots.js';
import type { VectorIndexDefinition } from './vector-index-definition.js';
import { getVectorIndexSlot } from './vector-index-helpers.js';
import {
    VectorIndexState,
    type VectorIndexExistingInfo,
    type VectorIndexStatus,
} from './vector-index-status.js';

export interface ComputeVectorIndexStatusInput {
    readonly field: Field;
    readonly existingForField: ReadonlyArray<VectorIndexDescription>;
    readonly requiredIndex: VectorIndexDefinition;
    readonly vectorDocumentCount: number;
    readonly computedNLists: number;
    readonly nListsPinned: boolean;
    readonly nListsRebuildThreshold?: number;
    readonly forceRecreate: boolean;
}

/**
 * Determines the status and required migrations for a single vector-indexed field.
 *
 * This is the core decision function of the vector index migration system. It receives
 * all necessary data (existing indexes, required index definition, document counts) as
 * explicit parameters, making it a pure function with no I/O. The actual data gathering
 * is done by VectorIndexAnalyzer, which calls this function.
 *
 * The function works in two phases:
 *
 * Phase 1 - Stuck-slot detection: If both A and B slots exist (caused by an interrupted
 * recreation), resolveStuckSlots decides which slot to keep and emits drop migrations.
 * If the surviving slot is still training, the function returns early with TRAINING or
 * RETRAINING state and no migrations.
 *
 * Phase 2 - Create/recreate decision: With at most one surviving index, evaluateSingleIndex
 * determines whether to create a new index, recreate an existing one (because parameters
 * changed or force-recreate was requested), or report that the index is already up-to-date.
 *
 * The returned VectorIndexStatus includes the resolved state, any pending migrations, and
 * diagnostic information like the nLists drift ratio.
 */
export function computeVectorIndexStatus(input: ComputeVectorIndexStatusInput): VectorIndexStatus {
    const {
        field,
        existingForField,
        requiredIndex,
        vectorDocumentCount,
        computedNLists,
        nListsPinned,
        nListsRebuildThreshold,
        forceRecreate,
    } = input;

    const rootEntityType = field.declaringType as RootEntityType;
    const vectorIndex = field.vectorIndex!;
    const collectionName = requiredIndex.collectionName;

    // Identify slot A and slot B from existing indexes
    const slotA = existingForField.find((idx) => getVectorIndexSlot(idx.name) === 'a');
    const slotB = existingForField.find((idx) => getVectorIndexSlot(idx.name) === 'b');

    // ----- Phase 1: Stuck-slot detection (both A and B exist) -----
    let survivingIndex: VectorIndexDescription | undefined;
    let stuckDropMigrations: SchemaMigration[] = [];
    let stuckState: VectorIndexState | undefined;

    if (slotA && slotB) {
        const result = resolveStuckSlots({
            slotA,
            slotB,
            requiredIndex,
            collectionName,
            nListsPinned,
            nListsRebuildThreshold,
            vectorDocumentCount,
        });
        survivingIndex = result.survivingIndex;
        stuckDropMigrations = result.migrations;
        stuckState = result.state;

        // If stuck resolution returned TRAINING or RETRAINING, return immediately with no migrations
        if (
            stuckState === VectorIndexState.TRAINING ||
            stuckState === VectorIndexState.RETRAINING
        ) {
            return buildStatus({
                rootEntityType,
                field,
                vectorIndex,
                collectionName,
                vectorDocumentCount,
                computedNLists,
                existingIndexInfo: buildExistingInfo(result.infoSource),
                state: stuckState,
                migrations: [],
                nListsPinned,
                requiredIndex,
            });
        }
    } else {
        // At most one index exists
        survivingIndex = slotA ?? slotB;
    }

    // ----- Phase 2: Create / Recreate decision (single surviving index or none) -----
    const singleResult = evaluateSingleIndex({
        survivingIndex,
        requiredIndex,
        vectorDocumentCount,
        nListsPinned,
        nListsRebuildThreshold,
        forceRecreate,
    });

    const allMigrations = [...stuckDropMigrations, ...singleResult.migrations];
    const state = stuckState === VectorIndexState.STUCK_CLEANUP ? stuckState : singleResult.state;

    return buildStatus({
        rootEntityType,
        field,
        vectorIndex,
        collectionName,
        vectorDocumentCount,
        computedNLists,
        existingIndexInfo: buildExistingInfo(survivingIndex),
        state,
        migrations: allMigrations,
        nListsPinned,
        requiredIndex,
    });
}

/**
 * Extracts a summary of the existing index for diagnostic output.
 *
 * Returns undefined when no index exists (e.g. first-time creation).
 */
function buildExistingInfo(
    index: VectorIndexDescription | undefined,
): VectorIndexExistingInfo | undefined {
    if (!index) {
        return undefined;
    }
    return {
        name: index.name,
        id: index.id,
        nLists: index.params.nLists ?? 0,
        metric: index.params.metric,
        dimension: index.params.dimension,
        trainingState: index.trainingState,
    };
}

interface BuildStatusInput {
    rootEntityType: RootEntityType;
    field: Field;
    vectorIndex: VectorIndex;
    collectionName: string;
    vectorDocumentCount: number;
    computedNLists: number;
    existingIndexInfo?: VectorIndexExistingInfo;
    state: VectorIndexState;
    migrations: ReadonlyArray<SchemaMigration>;
    nListsPinned: boolean;
    requiredIndex: VectorIndexDefinition;
}

/**
 * Assembles the final VectorIndexStatus, including the nLists drift ratio.
 *
 * The drift ratio measures how far the existing nLists value has drifted from the
 * auto-computed value (based on current document count). It is only computed when
 * nLists is auto-computed (not pinned) and an existing index is present.
 * A value of 0.5 means the existing nLists is 50% off from the computed value.
 */
function buildStatus(input: BuildStatusInput): VectorIndexStatus {
    const {
        rootEntityType,
        field,
        vectorIndex,
        collectionName,
        vectorDocumentCount,
        computedNLists,
        existingIndexInfo,
        state,
        migrations,
    } = input;

    // Compute nListsDrift from the surviving existing index info if available
    let nListsDrift: number | undefined;
    if (existingIndexInfo && !input.nListsPinned && existingIndexInfo.nLists > 0) {
        nListsDrift =
            Math.abs(computedNLists - existingIndexInfo.nLists) / existingIndexInfo.nLists;
    }

    return {
        rootEntityType,
        field,
        vectorIndex,
        collectionName,
        vectorDocumentCount,
        computedNLists,
        existingIndexInfo,
        state,
        nListsDrift,
        migrations,
    };
}
