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
    readonly fields: [string];
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
