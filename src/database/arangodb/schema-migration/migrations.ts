import { Relation, RootEntityType } from '../../../model/implementation';
import { describeIndex, getIndexDescriptor, IndexDefinition } from './index-helpers';

export type SchemaMigration = CreateIndexMigration | DropIndexMigration | CreateDocumentCollectionMigration
    | CreateEdgeCollectionMigration;

interface CreateIndexMigrationConfig {
    readonly index: IndexDefinition
    readonly collectionSize?: number
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
}

interface DropIndexMigrationConfig {
    readonly index: IndexDefinition
    readonly collectionSize?: number
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
}

export class CreateDocumentCollectionMigration {
    readonly type: 'createDocumentCollection' = 'createDocumentCollection';

    constructor(public readonly rootEntity: RootEntityType, public readonly collectionName: string) {
    }

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

    constructor(public readonly relation: Relation, public readonly collectionName: string) {
    }

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
