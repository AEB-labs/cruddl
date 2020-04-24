export { ArangoDBAdapter } from './arangodb-adapter';
export { ArangoDBConfig, ArangoJSConfig, CreateCollectionOptions, KeyGeneratorType } from './config';
export * from './schema-migration/migrations';
export { IndexDefinition, describeIndex, getIndexDescriptor } from './schema-migration/index-helpers';
export { TransactionError } from './transaction-error';
