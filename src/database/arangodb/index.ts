export { CreateCollectionOptions } from 'arangojs/collection.js';
export { Config as ArangoJSConfig } from 'arangojs/connection.js';
export { TransactionError } from '../../execution/transaction-error';
export { ArangoDBAdapter } from './arangodb-adapter';
export { ArangoDBConfig, KeyGeneratorType } from './config';
export {
    IndexDefinition,
    describeIndex,
    getIndexDescriptor,
} from './schema-migration/index-helpers';
export * from './schema-migration/migrations';
