import { Relation, RootEntityType } from '../../../model/implementation';
import { describeIndex, getIndexDescriptor, IndexDefinition } from './index-helpers';
import {ArangoSearchDefinition} from "./arango-search-helpers";
import {FieldConfig} from "../../../model/config";
import {ArangoSearchViewPropertiesOptions} from "arangojs/lib/cjs/view";

export type SchemaMigration = CreateIndexMigration | DropIndexMigration | CreateDocumentCollectionMigration
    | CreateEdgeCollectionMigration | CreateArangoSearchViewMigration | DropArangoSearchViewMigration | UpdateArangoSearchViewMigration;

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

interface CreateArangoSearchViewMigrationConfig{

    readonly viewName: string
    readonly properties: ArangoSearchViewPropertiesOptions
    readonly collectionSize?: number
}

interface UpdateArangoSearchViewMigrationConfig extends CreateArangoSearchViewMigrationConfig{

}

interface DropArangoSearchViewMigrationConfig{
    readonly viewName: string
}

export class DropArangoSearchViewMigration{
    readonly type: 'dropArangoSearchView' = 'dropArangoSearchView';
    readonly config: DropArangoSearchViewMigrationConfig;

    constructor(config: DropArangoSearchViewMigrationConfig) {
        this.config = config;
    }

    get description() {
        return `drop ArangoSearchView ${this.viewName}`;
    }

    get id() {
        return `dropArangoSearch/${this.viewName}`;
    }

    get viewName(){
        return this.config.viewName;
    }

    get isMandatory() {
        return false;
    }
}

export class UpdateArangoSearchViewMigration{
    readonly type: 'updateArangoSearchView' = 'updateArangoSearchView';
    readonly config: UpdateArangoSearchViewMigrationConfig;

    constructor(config: UpdateArangoSearchViewMigrationConfig) {
        this.config = config;
    }

    get description() {
        return `update ArangoSearchView ${this.viewName}`;
    }

    get id() {
        return `update ArangoSearch/${this.viewName}`;
    }

    get viewName(){
        return this.config.viewName;
    }

    get isMandatory() {
        return true;
    }
}

export class CreateArangoSearchViewMigration{
    readonly type: 'createArangoSearchView' = 'createArangoSearchView';
    readonly config: CreateArangoSearchViewMigrationConfig;

    constructor(config: CreateArangoSearchViewMigrationConfig) {
        this.config = config;
    }

    get description() {
        return `create ArangoSearchView ${this.config.viewName}`;
    }

    get id() {
        return `createArangoSearch/${this.config.viewName}`;
    }

    get isMandatory() {
        return true;
    }
}
