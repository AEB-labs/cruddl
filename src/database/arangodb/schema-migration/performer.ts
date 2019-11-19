import { Database } from 'arangojs';
import { ArangoDBConfig, initDatabase } from '../config';
import { ArangoDBVersionHelper } from '../version-helper';
import { ArangoSearchMigrationNotSupportedError } from './ArangoSearchMigrationNotSupportedError';
import { isArangoSearchSupported } from './index-helpers';
import {
    CreateArangoSearchViewMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    DropArangoSearchViewMigration,
    DropIndexMigration,
    RecreateArangoSearchViewMigration,
    SchemaMigration,
    UpdateArangoSearchViewMigration
} from './migrations';

export class MigrationPerformer {
    private readonly db: Database;
    private versionHelper: ArangoDBVersionHelper;

    constructor(private readonly config: ArangoDBConfig) {
        this.db = initDatabase(config);
        this.versionHelper = new ArangoDBVersionHelper(this.db);
    }

    async performMigration(migration: SchemaMigration) {
        switch (migration.type) {
            case 'createIndex':
                return this.createIndex(migration);
            case 'dropIndex':
                return this.dropIndex(migration);
            case 'createDocumentCollection':
                return this.createDocumentCollection(migration);
            case 'createEdgeCollection':
                return this.createEdgeCollection(migration);
            case 'createArangoSearchView':
                return this.createArangoSearchView(migration);
            case 'updateArangoSearchView':
                return this.updateArangoSearchView(migration);
            case 'dropArangoSearchView':
                return this.dropArangoSearchView(migration);
            case 'recreateArangoSearchView':
                return this.recreateArangoSearchView(migration);
            default:
                throw new Error(`Unknown migration type: ${(migration as any).type}`);
        }
    }

    private async createIndex(migration: CreateIndexMigration) {
        return this.db.collection(migration.index.collectionName).createIndex({
            fields: migration.index.fields,
            unique: migration.index.unique,
            sparse: migration.index.sparse,
            type: migration.index.type,
            inBackground: this.config.createIndicesInBackground
        });
    }

    private async dropIndex(migration: DropIndexMigration) {
        return this.db.collection(migration.index.collectionName).dropIndex(migration.index.id!);
    }

    private async createDocumentCollection(migration: CreateDocumentCollectionMigration) {
        await this.db.collection(migration.collectionName).create();
    }

    private async createEdgeCollection(migration: CreateEdgeCollectionMigration) {
        await this.db.edgeCollection(migration.collectionName).create();
    }

    private async createArangoSearchView(migration: CreateArangoSearchViewMigration) {
        if (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion())) {
            await this.db.arangoSearchView(migration.viewName).create(migration.properties);
            await this.db.arangoSearchView(migration.viewName).setProperties(migration.properties);
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private async updateArangoSearchView(migration: UpdateArangoSearchViewMigration) {
        if (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion())) {
            await this.db.arangoSearchView(migration.viewName).setProperties(migration.properties);
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private async dropArangoSearchView(migration: DropArangoSearchViewMigration) {
        if (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion())) {
            await this.db.arangoSearchView(migration.config.viewName).drop();
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private async recreateArangoSearchView(migration: RecreateArangoSearchViewMigration) {
        if (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion())) {
            await this.db.arangoSearchView(migration.viewName).drop();
            await this.db.arangoSearchView(migration.viewName).create(migration.properties);
            await this.db.arangoSearchView(migration.viewName).setProperties(migration.properties);
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }
}
