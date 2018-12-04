import { Database } from 'arangojs';
import { ArangoDBConfig, initDatabase } from '../config';
import { CreateDocumentCollectionMigration, CreateEdgeCollectionMigration, CreateIndexMigration, DropIndexMigration, SchemaMigration } from './migrations';

export class MigrationPerformer {
    private readonly db: Database;

    constructor(config: ArangoDBConfig) {
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
}
