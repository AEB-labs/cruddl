import { ArangoSearchViewPropertiesOptions } from 'arangojs/lib/cjs/view';
import { BillingEntityType, Relation, RootEntityType } from '../../../model/implementation';
import {
    describeIndex,
    describeTTLIndex,
    getIndexDescriptor,
    getTTLIndexDescriptor,
    IndexDefinition,
    TTL_INDEX_TYPE,
    TtlIndex
} from './index-helpers';

export type SchemaMigration =
    | CreateIndexMigration
    | DropIndexMigration
    | CreateDocumentCollectionMigration
    | CreateEdgeCollectionMigration
    | CreateArangoSearchViewMigration
    | DropArangoSearchViewMigration
    | UpdateArangoSearchViewMigration
    | RecreateArangoSearchViewMigration
    | CreateTTLIndexMigration
    | DropTTLIndexMigration
    | UpdateTTLIndexMigration;

interface CreateIndexMigrationConfig {
    readonly index: IndexDefinition;
    readonly collectionSize?: number;
}

export class CreateIndexMigration {
    readonly type: 'createIndex' = 'createIndex';
    readonly index: IndexDefinition;
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

    get isCritical() {
        return false;
    }
}

interface DropIndexMigrationConfig {
    readonly index: IndexDefinition;
    readonly collectionSize?: number;
}

export class DropIndexMigration {
    readonly type: 'dropIndex' = 'dropIndex';
    readonly index: IndexDefinition;
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

    get isCritical() {
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

    get isCritical() {
        return false;
    }
}

export class CreateEdgeCollectionMigration {
    readonly type: 'createEdgeCollection' = 'createEdgeCollection';

    constructor(public readonly relation: Relation, public readonly collectionName: string) {}

    get description() {
        return `create edge collection ${this.collectionName}`;
    }

    get id() {
        return `createEdgeCollection/collection:${this.collectionName}`;
    }

    get isMandatory() {
        return true;
    }

    get isCritical() {
        return false;
    }
}

interface CreateArangoSearchViewMigrationConfig {
    readonly viewName: string;
    readonly properties: ArangoSearchViewPropertiesOptions;
    readonly collectionName: string;
    readonly collectionSize?: number;
}

interface UpdateArangoSearchViewMigrationConfig extends CreateArangoSearchViewMigrationConfig {}

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
        return `dropArangoSearch/${this.viewName}`;
    }

    get viewName() {
        return this.config.viewName;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
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
        return `update ArangoSearch/${this.viewName}`;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
        return false;
    }
}

export class CreateArangoSearchViewMigration {
    readonly type: 'createArangoSearchView' = 'createArangoSearchView';
    readonly viewName: string;
    readonly properties: ArangoSearchViewPropertiesOptions;
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
        return `createArangoSearch/${this.viewName}`;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
        return false;
    }
}

export class RecreateArangoSearchViewMigration {
    readonly type: 'recreateArangoSearchView' = 'recreateArangoSearchView';
    readonly viewName: string;
    readonly properties: ArangoSearchViewPropertiesOptions;
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
        return `recreateArangoSearch/${this.viewName}`;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
        return false;
    }
}

export interface CreateTTLIndexMigrationConfig {
    ttlIndex: TtlIndex;
    collectionName: string;
}

export class CreateTTLIndexMigration {
    readonly type: 'createTTLIndex' = 'createTTLIndex';

    constructor(readonly config: CreateTTLIndexMigrationConfig) {}

    get description() {
        return `create ${describeTTLIndex(this.config.ttlIndex, this.config.collectionName)}`;
    }

    get id() {
        return `createTtlIndex/${getTTLIndexDescriptor(this.config.ttlIndex, this.config.collectionName)}`;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
        return true;
    }
}

export interface DropTTLIndexMigrationConfig {
    ttlIndex: TtlIndex;
    collectionName: string;
}

export class DropTTLIndexMigration {
    readonly type: 'dropTTLIndex' = 'dropTTLIndex';

    constructor(readonly config: DropTTLIndexMigrationConfig) {}

    get description() {
        return `drop ${describeTTLIndex(this.config.ttlIndex, this.config.collectionName)}`;
    }

    get id() {
        return `dropIndex/${getTTLIndexDescriptor(this.config.ttlIndex, this.config.collectionName)}`;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
        return false;
    }
}

export interface UpdateTTLIndexMigrationConfig {
    ttlIndex: TtlIndex;
    collectionName: string;
}

export class UpdateTTLIndexMigration {
    readonly type: 'updateTTLIndex' = 'updateTTLIndex';

    constructor(readonly config: UpdateTTLIndexMigrationConfig) {}

    get description() {
        return `update ${describeTTLIndex(this.config.ttlIndex, this.config.collectionName)}`;
    }

    get id() {
        return `updateTtlIndex/${getTTLIndexDescriptor(this.config.ttlIndex, this.config.collectionName)}`;
    }

    get isMandatory() {
        return false;
    }

    get isCritical() {
        return true;
    }
}
