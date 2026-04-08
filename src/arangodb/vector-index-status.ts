import type { RootEntityType } from '../core/model/implementation/root-entity-type.js';
import type { VectorIndex } from '../core/model/implementation/vector-index.js';
import type { SchemaMigration } from './schema-migration/migrations.js';

export interface VectorIndexExistingInfo {
    readonly name: string;
    readonly id: string;
    readonly nLists: number;
    readonly metric: string;
    readonly dimension: number;
}

export interface VectorIndexStatus {
    readonly rootEntityType: RootEntityType;
    readonly vectorIndex: VectorIndex;
    readonly collectionName: string;
    readonly documentCount: number;
    /**
     * The nLists value that would be used if the index were (re)created now,
     * based on the current document count. Uses the pinned value from the schema
     * if nLists is explicitly specified.
     */
    readonly computedNLists: number;
    readonly existingIndexInfo?: VectorIndexExistingInfo;
    /**
     * True if there is no matching vector index in the database.
     */
    readonly isIndexMissing: boolean;
    /**
     * True if the index is missing because the collection has no documents
     * (vector indexes cannot be trained on empty data).
     */
    readonly isDeferred: boolean;
    /**
     * True if the existing index parameters differ from the desired parameters
     * in a way that warrants recreation.
     */
    readonly needsRebuild: boolean;
    /**
     * The relative drift between the existing and computed nLists values.
     * Only set when the schema does not pin nLists and an index exists.
     */
    readonly nListsDriftPercent?: number;
    /**
     * A pending migration that would address the current state, if any.
     */
    readonly pendingMigration?: SchemaMigration;
}
