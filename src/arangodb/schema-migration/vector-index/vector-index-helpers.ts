import type { ArangoVectorSimilarityMetric, VectorIndexSlot } from './vector-index-definition.js';

export function mapMetricForArango(metric: string): ArangoVectorSimilarityMetric {
    switch (metric) {
        case 'L2':
            return 'l2';
        case 'INNER_PRODUCT':
            return 'innerProduct';
        case 'COSINE':
        default:
            return 'cosine';
    }
}

/**
 * Computes the recommended nLists value based on the document count.
 * Formula: max(1, min(N, round(15 * sqrt(N))))
 */
export function computeAutoNLists(docCount: number): number {
    if (docCount <= 0) {
        return 1;
    }
    return Math.max(1, Math.min(docCount, Math.round(15 * Math.sqrt(docCount))));
}

/**
 * Returns the ArangoDB index name for a vector index using the A/B slot naming scheme.
 */
export function vectorIndexSlotName(fieldName: string, slot: VectorIndexSlot): string {
    return `vector_${fieldName}_${slot}`;
}

/**
 * Returns the other slot for A/B naming.
 */
export function otherVectorIndexSlot(slot: VectorIndexSlot): VectorIndexSlot {
    return slot === 'a' ? 'b' : 'a';
}

/**
 * Determines the slot of an existing vector index by its name.
 * Returns undefined if the name does not match the expected pattern.
 */
export function getVectorIndexSlot(indexName: string): VectorIndexSlot | undefined {
    if (indexName.endsWith('_a')) {
        return 'a';
    }
    if (indexName.endsWith('_b')) {
        return 'b';
    }
    return undefined;
}

/**
 * Checks whether the nLists drift between an existing and a new value exceeds the given threshold.
 * The threshold is a fraction (e.g. 0.25 for 25%).
 */
export function nListsDriftExceedsThreshold(
    existingNLists: number,
    newNLists: number,
    threshold: number,
): boolean {
    if (existingNLists <= 0) {
        return true;
    }
    return Math.abs(newNLists - existingNLists) / existingNLists > threshold;
}
