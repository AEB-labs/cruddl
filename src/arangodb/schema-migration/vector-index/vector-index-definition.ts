import type { Field } from '../../../core/model/implementation/field.js';
import { mapMetricForArango } from './vector-index-helpers.js';

export type VectorIndexSlot = 'a' | 'b';

export type ArangoVectorSimilarityMetric = 'cosine' | 'l2' | 'innerProduct';

/**
 * Represents the desired index state derived from the model.
 *
 * Only used for the required/target index. Existing indexes are represented by the
 * arangojs VectorIndexDescription type returned from `collection.indexes()`.
 */
export interface VectorIndexDefinition {
    readonly collectionName: string;
    readonly fieldName: string;
    readonly sparse: boolean;
    /**
     * Target A/B slot for creation or recreation.
     *
     * Set by computeVectorIndexStatus. Always "a" for first-time creation;
     * the opposite slot for recreation.
     */
    readonly slot?: VectorIndexSlot;
    readonly params: {
        readonly metric: ArangoVectorSimilarityMetric;
        readonly dimension: number;
        readonly nLists?: number;
        readonly trainingIterations?: number;
        readonly factory?: string;
    };
    readonly storedValues?: ReadonlyArray<string>;
}

/**
 * Builds the index definition the model requires for a field with @vectorIndex
 *
 * @param nLists the nLists value to use if the model does not pin it (it depends on the number of
 * documents, so it can only be computed with access to the database)
 */
export function getRequiredVectorIndexDefinition(
    field: Field,
    { collectionName, nLists }: { collectionName: string; nLists: number | undefined },
): VectorIndexDefinition {
    const vectorIndex = field.vectorIndex;
    if (!vectorIndex) {
        throw new Error(`Field "${field.name}" does not have a vector index`);
    }
    return {
        fieldName: field.name,
        collectionName,
        sparse: vectorIndex.sparse,
        params: {
            metric: mapMetricForArango(vectorIndex.metric),
            dimension: vectorIndex.dimension || 1,
            nLists: vectorIndex.nLists ?? nLists,
            trainingIterations: vectorIndex.trainingIterations,
            factory: vectorIndex.factory,
        },
        storedValues: vectorIndex.storedValues.length > 0 ? vectorIndex.storedValues : undefined,
    };
}
