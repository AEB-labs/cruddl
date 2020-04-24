import { Database } from 'arangojs';
import { LoadBalancingStrategy } from 'arangojs/lib/cjs/connection';
import { globalContext } from '../../config/global';
import { ProjectOptions } from '../../config/interfaces';
import { Logger } from '../../config/logging';
import { CustomDatabase } from './arangojs-instrumentation/custom-database';
import { ArangoSearchConfiguration } from './schema-migration/arango-search-helpers';

export interface ArangoJSConfig {
    readonly url?: string | ReadonlyArray<string>;
    readonly isAbsolute?: boolean;
    readonly arangoVersion?: number;
    readonly loadBalancingStrategy?: LoadBalancingStrategy;
    readonly maxRetries?: false | number;
    readonly agent?: any;
    readonly agentOptions?: {
        readonly [key: string]: any;
    };
    readonly headers?: {
        readonly [key: string]: string;
    };
}

export interface CreateCollectionOptions {
    readonly waitForSync?: boolean;
    readonly journalSize?: number;
    readonly isVolatile?: boolean;
    readonly isSystem?: boolean;
    readonly keyOptions?: {
        readonly type?: KeyGeneratorType;
        readonly allowUserKeys?: boolean;
        readonly increment?: number;
        readonly offset?: number;
    };
    readonly numberOfShards?: number;
    readonly shardKeys?: readonly string[];
    readonly distributeShardsLike?: string;
    readonly shardingStrategy?: string;
    readonly smartJoinAttribute?: string;
    readonly replicationFactor?: number;
    readonly minReplicationFactor?: number;
}

export declare type KeyGeneratorType = 'traditional' | 'autoincrement' | 'uuid' | 'padded';

export const DEFAULT_RETRY_DELAY_BASE_MS = 100;

export interface ArangoDBConfig {
    /**
     * Additional configuration options that will be passed to the ArangoJS Database constructor
     */
    readonly arangoJSConfig?: ArangoJSConfig;

    readonly url: string;
    readonly user?: string;
    readonly password?: string;

    /**
     * If set, this token will be sent using Authorization: Bearer
     */
    readonly authToken?: string;

    readonly databaseName: string;

    /**
     * Specifies if non mandatory migrations should be executed automatically. Defaults to true.
     */
    readonly doNonMandatoryMigrations?: boolean;

    /**
     * The memory limit in bytes to impose on ArangoDB queries (does not apply to the whole ArangoDB transaction).
     *
     * Can be overridden with the queryMemoryLimit option in ExecutionOptions
     */
    readonly queryMemoryLimit?: number;

    /**
     * If enabled, collection traversals add an indirection between the filter/order part and the projection part
     * so that ArangoDB will do the filtering/sorting on a leaner versions of the documents, then load the full
     * documents for the projection part.
     *
     * This is mainly an issue when sorting large documents and should become less of an issue with ArangoDB 3.5 where
     * sort memory usage will be optimized drastically.
     *
     * See https://github.com/arangodb/arangodb/issues/7821
     */
    readonly enableExperimentalProjectionIndirection?: boolean;

    /**
     * If set, enableExperimentalProjectionIndirection will only apply to root entity types specified in this list.
     */
    readonly experimentalProjectionIndirectionTypeNames?: ReadonlyArray<string>;

    /**
     * The number of times a transaction that generated an optimistic locking error (ERROR_ARANGO_CONFLICT) will be
     * retried automatically. Defaults to zero.
     */
    readonly retriesOnConflict?: number;

    /**
     * The delay between the first and second retry attempt on conflict (see maxRetriesOnConflict). Will be doubled on
     * each retry. The delay between the first *try* and the first retry is always zero. Defaults to 100ms.
     */
    readonly retryDelayBaseMs?: number;

    /**
     * How many steps of recursive fields are indexed and allowed in queries for FlexSearch.
     */
    readonly arangoSearchConfiguration?: ArangoSearchConfiguration;

    /**
     * If set to `true`, collections will still be available for modifications during index creation.
     *
     * Only supported from ArangoDB 3.5 onwards. Background index creation can be slower and take more memory and should
     * still be performed during times of reduced load.
     */
    readonly createIndicesInBackground?: boolean;

    readonly createCollectionOptions?: CreateCollectionOptions;
}

export function initDatabase(config: ArangoDBConfig): Database {
    const db = new CustomDatabase({
        ...(config.arangoJSConfig ? config.arangoJSConfig : {}),
        url: config.url
    }).useDatabase(config.databaseName);
    if (config.user) {
        db.useBasicAuth(config.user, config.password);
    }
    if (config.authToken) {
        db.useBearerAuth(config.authToken);
    }
    return db;
}

export function getArangoDBLogger(schemaContext: ProjectOptions | undefined): Logger {
    globalContext.registerContext(schemaContext);
    try {
        return globalContext.loggerProvider.getLogger('ArangoDBAdapter');
    } finally {
        globalContext.unregisterContext();
    }
}
