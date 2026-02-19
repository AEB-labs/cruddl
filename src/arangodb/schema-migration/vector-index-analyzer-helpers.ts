import type { VectorIndexDefinition } from './index-helpers.js';
import { nListsDriftExceedsThreshold } from './index-helpers.js';

/**
 * Determines whether a vector index needs to be dropped and rebuilt.
 *
 * Returns `true` when any of the following conditions apply:
 * - Core params (metric, dimension) or sparseness changed
 * - storedValues changed
 * - nLists changed (pinned) or drifted beyond the configured threshold (auto-computed)
 *
 * @param existing - the current ArangoDB index definition
 * @param required - the desired index definition (nLists must already be resolved)
 * @param nListsPinned - `true` when the model explicitly sets `nLists` (rebuild on any change);
 *   `false` for auto-computed nLists (rebuild only if drift exceeds the threshold)
 * @param nListsRebuildThreshold - fractional drift threshold for auto-computed nLists rebuilds
 *   (e.g. 0.25 = 25 %). When `undefined`, auto-computed nLists drift never triggers a rebuild.
 */
export function vectorIndexNeedsRecreation(
    existing: VectorIndexDefinition,
    required: VectorIndexDefinition,
    nListsPinned: boolean,
    nListsRebuildThreshold?: number,
): boolean {
    // Core parameter changes always require a full rebuild.
    if (
        existing.params.metric !== required.params.metric ||
        existing.params.dimension !== required.params.dimension ||
        existing.sparse !== required.sparse
    ) {
        return true;
    }

    // storedValues changes require a rebuild. Sort before comparing so that reordering fields
    // in the schema does not unnecessarily trigger a recreation.
    if (
        [...(existing.storedValues ?? [])].sort().join('|') !==
        [...(required.storedValues ?? [])].sort().join('|')
    ) {
        return true;
    }

    // nLists checks — only relevant when both existing and resolved nLists are known.
    if (existing.params.nLists != null && required.params.nLists != null) {
        if (nListsPinned) {
            // Explicit nLists in the model: rebuild whenever the value differs.
            return existing.params.nLists !== required.params.nLists;
        } else {
            // Auto-computed nLists: rebuild only when drift exceeds the configured threshold.
            // If no threshold is configured, nLists drift never triggers an automatic rebuild.
            if (nListsRebuildThreshold == null) {
                return false;
            }
            return nListsDriftExceedsThreshold(
                existing.params.nLists,
                required.params.nLists,
                nListsRebuildThreshold,
            );
        }
    }

    return false;
}
