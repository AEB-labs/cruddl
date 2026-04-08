export type { CreateCollectionOptions } from 'arangojs/collections';
export { TransactionError } from '../core/execution/transaction-error.js';
export { ArangoDBAdapter } from './arangodb-adapter.js';
export type { ArangoDBConfig, KeyGeneratorType } from './config.js';
export type { ArangoSearchConfiguration } from './schema-migration/arango-search-helpers.js';
export {
    describeIndex,
    getIndexDescriptor,
    type IndexDefinition,
} from './schema-migration/index-helpers.js';
export {
    CreateArangoSearchAnalyzerMigration,
    CreateArangoSearchViewMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    CreateVectorIndexMigration,
    DropArangoSearchViewMigration,
    DropIndexMigration,
    RecreateArangoSearchViewMigration,
    RecreateVectorIndexMigration,
    UpdateArangoSearchAnalyzerMigration,
    UpdateArangoSearchViewMigration,
    type CreateArangoSearchAnalyzerMigrationConfig,
    type SchemaMigration,
    type UpdateArangoSearchAnalyzerMigrationConfig,
} from './schema-migration/migrations.js';
export type { VectorIndexStatus } from './vector-index-status.js';
