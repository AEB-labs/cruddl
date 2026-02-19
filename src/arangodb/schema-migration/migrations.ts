import type { CreateAnalyzerOptions } from 'arangojs/analyzers';
import type { VectorIndexDescription } from 'arangojs/indexes';
import type {
    ArangoSearchViewPropertiesOptions,
    CreateArangoSearchViewOptions,
} from 'arangojs/views';
import type { Relation } from '../../core/model/implementation/relation.js';
import type { PersistentIndexDefinition } from './index-helpers.js';
import { describeIndex, getIndexDescriptor } from './index-helpers.js';
import type { VectorIndexDefinition } from './vector-index/vector-index-definition.js';

export type SchemaMigration =
    | CreateIndexMigration
    | DropIndexMigration
    | CreateVectorIndexMigration
    | RecreateVectorIndexMigration
    | DropVectorIndexMigration
    | CreateDocumentCollectionMigration
    | CreateEdgeCollectionMigration
    | CreateArangoSearchViewMigration
    | DropArangoSearchViewMigration
    | UpdateArangoSearchViewMigration
    | RecreateArangoSearchViewMigration
    | CreateArangoSearchAnalyzerMigration
    | UpdateArangoSearchAnalyzerMigration;

interface CreateIndexMigrationConfig {
    readonly index: PersistentIndexDefinition;
    readonly collectionSize?: number;
}

export class CreateIndexMigration {
    readonly type: 'createIndex' = 'createIndex';
    readonly index: PersistentIndexDefinition;
    readonly collectionSize: number | undefined;

    constructor(config: CreateIndexMigrationConfig) {
        this.index = config.index;
        this.collectionSize = config.collectionSize;
    }

    get description() {
        return `create ${describeIndex(this.index)}`;
    }

    get id() {
        return `createIndex/${getIndexDescriptor(this.index)}`;
    }

    get isMandatory() {
        return false;
    }
}

interface DropIndexMigrationConfig {
    readonly index: PersistentIndexDefinition;
    readonly collectionSize?: number;
}

export class DropIndexMigration {
    readonly type: 'dropIndex' = 'dropIndex';
    readonly index: PersistentIndexDefinition;
    readonly collectionSize: number | undefined;

    constructor(config: DropIndexMigrationConfig) {
        this.index = config.index;
        this.collectionSize = config.collectionSize;
    }

    get description() {
        return `drop ${describeIndex(this.index)}`;
    }

    get id() {
        return `dropIndex/${getIndexDescriptor(this.index)}`;
    }

    get isMandatory() {
        return false;
    }
}

interface CreateVectorIndexMigrationConfig {
    readonly requiredIndex: VectorIndexDefinition;
    readonly vectorDocumentCount?: number;
}

/**
 * Migration that creates a new vector index for the first time (no existing index is present).
 * The index is always created in slot 'a'. The actual index name is derived by the performer
 * using vectorIndexSlotName(field, 'a').
 */
export class CreateVectorIndexMigration {
    readonly type: 'createVectorIndex' = 'createVectorIndex';
    readonly requiredIndex: VectorIndexDefinition;
    readonly vectorDocumentCount: number | undefined;

    constructor(config: CreateVectorIndexMigrationConfig) {
        this.requiredIndex = config.requiredIndex;
        this.vectorDocumentCount = config.vectorDocumentCount;
    }

    get description() {
        return `create vector index ${this.requiredIndex.collectionName}/${this.requiredIndex.fieldName}`;
    }

    get id() {
        return `createVectorIndex/${this.requiredIndex.collectionName}/${this.requiredIndex.fieldName}`;
    }

    get isMandatory() {
        return false;
    }
}

interface RecreateVectorIndexMigrationConfig {
    readonly existingIndex: VectorIndexDescription;
    readonly requiredIndex: VectorIndexDefinition;
    readonly vectorDocumentCount?: number;
}

/**
 * Migration that recreates an existing vector index with updated parameters (e.g. changed metric,
 * dimension, or nLists). Uses the A/B slot naming scheme: the new index is created in the slot
 * opposite to the existing one, and the old index is dropped once the new one is ready.
 */
export class RecreateVectorIndexMigration {
    readonly type: 'recreateVectorIndex' = 'recreateVectorIndex';
    readonly existingIndex: VectorIndexDescription;
    readonly requiredIndex: VectorIndexDefinition;
    readonly vectorDocumentCount: number | undefined;

    constructor(config: RecreateVectorIndexMigrationConfig) {
        this.existingIndex = config.existingIndex;
        this.requiredIndex = config.requiredIndex;
        this.vectorDocumentCount = config.vectorDocumentCount;
    }

    get description() {
        return `recreate vector index ${this.requiredIndex.collectionName}/${this.requiredIndex.fieldName} with updated parameters`;
    }

    get id() {
        return `recreateVectorIndex/${this.requiredIndex.collectionName}/${this.requiredIndex.fieldName}`;
    }

    get isMandatory() {
        return false;
    }
}

interface DropVectorIndexMigrationConfig {
    readonly collectionName: string;
    readonly index: VectorIndexDescription;
}

/**
 * Migration that drops a vector index, identified solely by its name.
 */
export class DropVectorIndexMigration {
    readonly type: 'dropVectorIndex' = 'dropVectorIndex';
    readonly collectionName: string;
    readonly index: VectorIndexDescription;

    constructor(config: DropVectorIndexMigrationConfig) {
        this.index = config.index;
        this.collectionName = config.collectionName;
    }

    get description() {
        return `drop vector index "${this.index.name}" (${this.index.id}) on collection ${this.collectionName}`;
    }

    get id() {
        return `dropVectorIndex/${this.collectionName}/${this.index.id}`;
    }

    get isMandatory() {
        return false;
    }
}

export class CreateDocumentCollectionMigration {
    readonly type: 'createDocumentCollection' = 'createDocumentCollection';

    constructor(public readonly collectionName: string) {}

    get description() {
        return `create document collection ${this.collectionName}`;
    }

    get id() {
        return `createDocumentCollection/collection:${this.collectionName}`;
    }

    get isMandatory() {
        return true;
    }
}

export class CreateEdgeCollectionMigration {
    readonly type: 'createEdgeCollection' = 'createEdgeCollection';

    constructor(
        public readonly relation: Relation,
        public readonly collectionName: string,
    ) {}

    get description() {
        return `create edge collection ${this.collectionName}`;
    }

    get id() {
        return `createEdgeCollection/collection:${this.collectionName}`;
    }

    get isMandatory() {
        return true;
    }
}

interface CreateArangoSearchViewMigrationConfig {
    readonly viewName: string;
    readonly properties: CreateArangoSearchViewOptions;
    readonly collectionName: string;
    readonly collectionSize?: number;
}

interface UpdateArangoSearchViewMigrationConfig {
    readonly viewName: string;
    readonly properties: ArangoSearchViewPropertiesOptions;
    readonly collectionName: string;
    readonly collectionSize?: number;
}

interface DropArangoSearchViewMigrationConfig {
    readonly viewName: string;
}

export class DropArangoSearchViewMigration {
    readonly type: 'dropArangoSearchView' = 'dropArangoSearchView';
    readonly config: DropArangoSearchViewMigrationConfig;

    constructor(config: DropArangoSearchViewMigrationConfig) {
        this.config = config;
    }

    get description() {
        return `Drop the ArangoSearchView ${this.viewName}`;
    }

    get id() {
        return `dropArangoSearchView/${this.viewName}`;
    }

    get viewName() {
        return this.config.viewName;
    }

    get isMandatory() {
        return false;
    }
}

export class UpdateArangoSearchViewMigration {
    readonly type: 'updateArangoSearchView' = 'updateArangoSearchView';
    readonly viewName: string;
    readonly properties: ArangoSearchViewPropertiesOptions;
    readonly collectionName: string;
    readonly collectionSize?: number;

    constructor(config: UpdateArangoSearchViewMigrationConfig) {
        this.viewName = config.viewName;
        this.properties = config.properties;
        this.collectionName = config.collectionName;
        this.collectionSize = config.collectionSize;
    }

    get description() {
        return `Update the ArangoSearchView ${this.viewName} for the collection ${this.collectionName}`;
    }

    get id() {
        return `updateArangoSearchView/${this.viewName}`;
    }

    get isMandatory() {
        return false;
    }
}

export class CreateArangoSearchViewMigration {
    readonly type: 'createArangoSearchView' = 'createArangoSearchView';
    readonly viewName: string;
    readonly properties: CreateArangoSearchViewOptions;
    readonly collectionName: string;
    readonly collectionSize?: number;

    constructor(config: CreateArangoSearchViewMigrationConfig) {
        this.viewName = config.viewName;
        this.properties = config.properties;
        this.collectionName = config.collectionName;
        this.collectionSize = config.collectionSize;
    }

    get description() {
        return `Create the ArangoSearchView ${this.viewName} for the collection ${this.collectionName}`;
    }

    get id() {
        return `createArangoSearchView/${this.viewName}`;
    }

    get isMandatory() {
        return false;
    }
}

export class RecreateArangoSearchViewMigration {
    readonly type: 'recreateArangoSearchView' = 'recreateArangoSearchView';
    readonly viewName: string;
    readonly properties: CreateArangoSearchViewOptions;
    readonly collectionName: string;
    readonly collectionSize?: number;

    constructor(config: CreateArangoSearchViewMigrationConfig) {
        this.viewName = config.viewName;
        this.properties = config.properties;
        this.collectionName = config.collectionName;
        this.collectionSize = config.collectionSize;
    }

    get description() {
        return `Recreate the ArangoSearchView ${this.viewName} for the collection ${this.collectionName}`;
    }

    get id() {
        return `recreateArangoSearchView/${this.viewName}`;
    }

    get isMandatory() {
        return false;
    }
}

export class CreateArangoSearchAnalyzerMigration {
    readonly type: 'createArangoSearchAnalyzer' = 'createArangoSearchAnalyzer';
    readonly name: string;
    readonly options: CreateAnalyzerOptions;

    constructor(config: CreateArangoSearchAnalyzerMigrationConfig) {
        this.name = config.name;
        this.options = config.options;
    }

    get description() {
        return `Create the ArangoSearchAnalyzer ${this.name}`;
    }

    get id() {
        return `createArangoSearchAnalyzer/${this.name}`;
    }

    get isMandatory() {
        return true;
    }
}

export interface CreateArangoSearchAnalyzerMigrationConfig {
    readonly name: string;
    readonly options: CreateAnalyzerOptions;
}

export class UpdateArangoSearchAnalyzerMigration {
    readonly type: 'updateArangoSearchAnalyzer' = 'updateArangoSearchAnalyzer';
    readonly name: string;
    readonly options: CreateAnalyzerOptions;

    constructor(config: UpdateArangoSearchAnalyzerMigrationConfig) {
        this.name = config.name;
        this.options = config.options;
    }

    get description() {
        return `Update the ArangoSearchAnalyzer ${this.name}`;
    }

    get id() {
        return `updateArangoSearchAnalyzer/${this.name}`;
    }

    get isMandatory() {
        return true;
    }
}

export interface UpdateArangoSearchAnalyzerMigrationConfig {
    readonly name: string;
    readonly options: CreateAnalyzerOptions;
}
