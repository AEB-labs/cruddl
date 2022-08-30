export { Config as ArangoJSConfig } from 'arangojs/connection';
export { CreateCollectionOptions } from 'arangojs/collection';
export { ArangoDBAdapter } from './arangodb-adapter';
export { ArangoDBConfig, KeyGeneratorType } from './config';
export * from './schema-migration/migrations';
export {
    IndexDefinition,
    describeIndex,
    getIndexDescriptor,
} from './schema-migration/index-helpers';
export { TransactionError } from '../../execution/transaction-error';
