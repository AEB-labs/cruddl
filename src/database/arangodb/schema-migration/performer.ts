import { CollectionType, Database } from 'arangojs';
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
        return this.db.collection(migration.index.collectionName).ensureIndex(
            {
                type: 'persistent',
                fields: migration.index.fields.slice(),
                unique: migration.index.unique,
                sparse: migration.index.sparse,
                inBackground: this.config.createIndicesInBackground
            } as any /* inBackground is not supported by the types */
        );
    }

    private async dropIndex(migration: DropIndexMigration) {
        return this.db.collection(migration.index.collectionName).dropIndex(migration.index.id!);
    }

    private async createDocumentCollection(migration: CreateDocumentCollectionMigration) {
        await this.db.createCollection(migration.collectionName, {
            ...(this.config.createCollectionOptions as any),
            type: CollectionType.DOCUMENT_COLLECTION
        });
    }

    private async createEdgeCollection(migration: CreateEdgeCollectionMigration) {
        await this.db.createCollection(migration.collectionName, {
            ...(this.config.createCollectionOptions as any),
            type: CollectionType.EDGE_COLLECTION
        });
    }

    private async createArangoSearchView(migration: CreateArangoSearchViewMigration) {
        if (this.isSkipVersionCheck || (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion()))) {
            await this.db.createView(migration.viewName, migration.properties);
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private async updateArangoSearchView(migration: UpdateArangoSearchViewMigration) {
        if (this.isSkipVersionCheck || (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion()))) {
            await this.db.view(migration.viewName).replaceProperties(migration.properties);
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private async dropArangoSearchView(migration: DropArangoSearchViewMigration) {
        if (this.isSkipVersionCheck || (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion()))) {
            await this.db.view(migration.config.viewName).drop();
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private async recreateArangoSearchView(migration: RecreateArangoSearchViewMigration) {
        if (this.isSkipVersionCheck || (await isArangoSearchSupported(this.versionHelper.getArangoDBVersion()))) {
            await this.db.view(migration.viewName).drop();
            await this.db.createView(migration.viewName, migration.properties);
        } else {
            throw new ArangoSearchMigrationNotSupportedError();
        }
    }

    private get isSkipVersionCheck() {
        return (
            this.config.arangoSearchConfiguration &&
            this.config.arangoSearchConfiguration.skipVersionCheckForArangoSearchMigrations
        );
    }
}
