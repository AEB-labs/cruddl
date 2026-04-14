import type { VectorIndexTrainingState } from 'arangojs/indexes';
import type { Field } from '../../../core/model/implementation/field.js';
import type { RootEntityType } from '../../../core/model/implementation/root-entity-type.js';
import type { VectorIndex } from '../../../core/model/implementation/vector-index.js';
import type { SchemaMigration } from '../migrations.js';

export enum VectorIndexState {
    /** The existing index matches the model - no action needed. */
    UP_TO_DATE = 'UP_TO_DATE',
    /** No index exists, but the collection is empty - creation is deferred. */
    DEFERRED = 'DEFERRED',
    /** No index exists and the collection has data - creation is pending. */
    NEEDS_CREATE = 'NEEDS_CREATE',
    /** The existing index parameters differ from the model - recreation is pending. */
    NEEDS_RECREATE = 'NEEDS_RECREATE',
    /** Both A and B slots exist - stuck-slot cleanup is pending. */
    STUCK_CLEANUP = 'STUCK_CLEANUP',
    /**
     * The sole existing index is present but not yet ready (still training).
     *
     * No correct ready index is available to serve queries.
     */
    TRAINING = 'TRAINING',
    /**
     * A correct, ready index exists and is serving queries.
     *
     * A second slot is currently training (e.g. an in-progress forced recreation).
     * No action is required - wait for training to complete; the next analysis run will
     * perform stuck-slot cleanup via the tiebreaker.
     */
    RETRAINING = 'RETRAINING',
}

export interface VectorIndexExistingInfo {
    readonly name: string;
    readonly id: string;
    readonly nLists: number;
    readonly metric: string;
    readonly dimension: number;
    /**
     * Training state reported by ArangoDB 3.12.9+.
     * "ready" indicates the index has been fully trained and is usable.
     */
    readonly trainingState?: VectorIndexTrainingState;
}

export interface VectorIndexStatus {
    readonly rootEntityType: RootEntityType;
    readonly field: Field;
    readonly vectorIndex: VectorIndex;
    readonly collectionName: string;
    /** Number of documents contributing a vector to this index (sparse-aware). */
    readonly vectorDocumentCount: number;
    readonly computedNLists: number;
    readonly existingIndexInfo?: VectorIndexExistingInfo;
    readonly state: VectorIndexState;
    readonly nListsDrift?: number;
    /**
     * Migrations needed to bring this field's index in sync with the model.
     * Empty when state is UP_TO_DATE, DEFERRED, TRAINING, or RETRAINING.
     */
    readonly migrations: ReadonlyArray<SchemaMigration>;
}
