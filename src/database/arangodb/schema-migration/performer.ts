import { Database } from 'arangojs';
import { ArangoDBConfig, initDatabase } from '../config';
import { ArangoSearchNotSupportedError } from './ArangoSearchNotSupportedError';
import {
    CreateArangoSearchViewMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration, DropArangoSearchViewMigration,
    DropIndexMigration,
    SchemaMigration, UpdateArangoSearchViewMigration
} from './migrations';
import { ArangoDBVersionHelper } from '../version-helper';

export class MigrationPerformer {
    private readonly db: Database;
    private versionHelper: ArangoDBVersionHelper;

    constructor(config: ArangoDBConfig) {
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
            default:
                throw new Error(`Unknown migration type: ${(migration as any).type}`);
        }
    }

    private async createIndex(migration: CreateIndexMigration) {
        return this.db.collection(migration.index.collectionName).createIndex({
            fields: migration.index.fields,
            unique: migration.index.unique,
            sparse: migration.index.sparse,
            type: migration.index.type
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
        if (await this.isArangoSearchSupported()) {
            await this.db.arangoSearchView(migration.config.viewName).create();
            // Setting the properties during creation does not work for some reason
            await this.db.arangoSearchView(migration.config.viewName).setProperties(migration.config.properties);
        } else {
            throw new ArangoSearchNotSupportedError();
        }

    }

    private async isArangoSearchSupported() {
        const version = await this.versionHelper.getArangoDBVersion();
        return version && (version.major === 3 && version.minor == 4);
    }

    private async updateArangoSearchView(migration: UpdateArangoSearchViewMigration) {
        if (await this.isArangoSearchSupported()) {
            await this.db.arangoSearchView(migration.config.viewName).setProperties(migration.config.properties);
        } else {
            throw new ArangoSearchNotSupportedError();
        }
    }

    private async dropArangoSearchView(migration: DropArangoSearchViewMigration) {
        if (await this.isArangoSearchSupported()) {
            await this.db.arangoSearchView(migration.config.viewName).drop();
        } else {
            throw new ArangoSearchNotSupportedError();
        }
    }
}
