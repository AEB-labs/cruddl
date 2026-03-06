export type { CreateCollectionOptions } from 'arangojs/collection.js';
export type { Config as ArangoJSConfig } from 'arangojs/connection.js';
export { TransactionError } from '../../execution/transaction-error.js';
export { ArangoDBAdapter } from './arangodb-adapter.js';
export type { ArangoDBConfig, KeyGeneratorType } from './config.js';
export type { ArangoSearchConfiguration } from './schema-migration/arango-search-helpers.js';
export {
    describeIndex,
    getIndexDescriptor,
    type IndexDefinition,
} from './schema-migration/index-helpers.js';
export * from './schema-migration/migrations.js';
