import type { VectorIndexDescription } from 'arangojs/indexes';
import type { VectorIndexDefinition } from './vector-index-definition.js';
import { nListsDriftExceedsThreshold } from './vector-index-helpers.js';

export interface VectorIndexNeedsRecreationParams {
    readonly existing: VectorIndexDescription;
    readonly required: VectorIndexDefinition;
    readonly nListsPinned: boolean;
    readonly nListsRebuildThreshold?: number;
}

/**
 * Compares an existing index against the required index.
 * Returns `true` when recreation is necessary.
 */
export function vectorIndexNeedsRecreation(params: VectorIndexNeedsRecreationParams): boolean {
    const { existing, required, nListsPinned, nListsRebuildThreshold } = params;

    // 1. Core parameter change: metric, dimension, or sparse differs
    if (existing.params.metric !== required.params.metric) {
        return true;
    }
    if (existing.params.dimension !== required.params.dimension) {
        return true;
    }
    if (existing.sparse !== required.sparse) {
        return true;
    }

    // 2. storedValues change (sorted comparison, treating undefined as [])
    const existingStored = [...(existing.storedValues ?? [])].sort();
    const requiredStored = [...(required.storedValues ?? [])].sort();
    if (existingStored.join('|') !== requiredStored.join('|')) {
        return true;
    }

    // 3. nLists change (pinned): when nListsPinned and values differ
    if (nListsPinned) {
        if (
            existing.params.nLists != null &&
            required.params.nLists != null &&
            existing.params.nLists !== required.params.nLists
        ) {
            return true;
        }
    }

    // 4. nLists drift (auto-computed): when not pinned, threshold is configured,
    //    and drift exceeds threshold. Returns false when either nLists is undefined.
    if (!nListsPinned && nListsRebuildThreshold != null) {
        if (existing.params.nLists != null && required.params.nLists != null) {
            if (
                nListsDriftExceedsThreshold(
                    existing.params.nLists,
                    required.params.nLists,
                    nListsRebuildThreshold,
                )
            ) {
                return true;
            }
        }
    }

    return false;
}
