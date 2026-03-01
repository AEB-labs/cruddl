export { CreateCollectionOptions } from 'arangojs/collection.js';
export { Config as ArangoJSConfig } from 'arangojs/connection.js';
export { TransactionError } from '../../execution/transaction-error.js';
export { ArangoDBAdapter } from './arangodb-adapter.js';
export { ArangoDBConfig, KeyGeneratorType } from './config.js';
export {
    IndexDefinition,
    describeIndex,
    getIndexDescriptor,
} from './schema-migration/index-helpers.js';
export * from './schema-migration/migrations.js';
