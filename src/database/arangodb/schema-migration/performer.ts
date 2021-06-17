import { CollectionType, Database } from 'arangojs';
import { ArangoDBConfig, initDatabase } from '../config';
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

    constructor(private readonly config: ArangoDBConfig) {
        this.db = initDatabase(config);
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
            } as any /* inBackground is not included in the types, but it works */
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
        await this.db.createView(migration.viewName, migration.properties);
    }

    private async updateArangoSearchView(migration: UpdateArangoSearchViewMigration) {
        await this.db.view(migration.viewName).replaceProperties(migration.properties);
    }

    private async dropArangoSearchView(migration: DropArangoSearchViewMigration) {
        await this.db.view(migration.config.viewName).drop();
    }

    private async recreateArangoSearchView(migration: RecreateArangoSearchViewMigration) {
        await this.db.view(migration.viewName).drop();
        await this.db.createView(migration.viewName, migration.properties);
    }
}
