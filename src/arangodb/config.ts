import { Database } from 'arangojs';
import type { CreateCollectionOptions } from 'arangojs/collections';
import type { ConfigOptions } from 'arangojs/configuration';
import { DEFAULT_LOGGER_PROVIDER } from '../core/config/console-logger.js';
import type { ProjectOptions } from '../core/config/interfaces.js';
import type { Logger } from '../core/config/logging.js';
import type { ArangoSearchConfiguration } from './schema-migration/arango-search-helpers.js';

export declare type KeyGeneratorType = 'traditional' | 'autoincrement' | 'uuid' | 'padded';

export const DEFAULT_RETRY_DELAY_BASE_MS = 100;
export const RETRY_DELAY_RANDOM_FRACTION = 0.5;

export interface ArangoDBConfig {
    /**
     * Additional configuration options that will be passed to the ArangoJS Database constructor
     */
    readonly arangoJSConfig?: Partial<ConfigOptions>;

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
     * Background index creation can be slower and take more memory and should still be performed during times of
     * reduced load.
     */
    readonly createIndicesInBackground?: boolean;

    readonly createCollectionOptions?: CreateCollectionOptions;

    /**
     * A regular expression that matches index names that should not be deleted with migrations
     *
     * Indices without names will never be ignored.
     */
    readonly nonManagedIndexNamesPattern?: RegExp;

    /**
     * Controls automatic nLists drift detection for vector indexes with auto-computed nLists.
     *
     * **Background**: ArangoDB vector indexes use the IVF (Inverted File Index) algorithm, which
     * partitions document embeddings into `nLists` clusters at index-creation time. When the
     * number of documents grows significantly, the originally chosen `nLists` value may no longer
     * be optimal - too few clusters reduce recall, too many waste memory and slow down queries.
     *
     * When this option is set, cruddl re-computes the recommended `nLists` on every analysis run
     * using the formula `max(1, min(N, round(15 × √N)))` where N is the current document count.
     * If the re-computed value differs from the current index's `nLists` by more than the
     * configured fraction, a recreate migration is generated automatically.
     *
     * Example: a value of `0.25` triggers a rebuild when the re-computed nLists would differ by
     * more than 25 % from the existing index's nLists (e.g. existing 100 -> rebuild if new < 75 or
     * > 125).
     *
     * **Important**: this option only reacts to nLists drift caused by document-count growth. It
     * does **not** replace a manual rebuild for other scenarios, such as data distribution changes
     * (cluster skew), changed embedding models, or index corruption. For those cases, call
     * `recreateVectorIndex()` explicitly.
     *
     * If not set, nLists drift never triggers an automatic rebuild.
     */
    readonly vectorIndexNListsRebuildThreshold?: number;

    /**
     * Maximum time in milliseconds to wait for a vector index to finish training before the
     * migration is considered failed.
     *
     * ArangoDB reports a `trainingState` field on vector indexes (3.12.9+). After `ensureIndex`
     * returns, cruddl polls this field until the index reports `"ready"`. If the index does not
     * become ready within the configured timeout, the migration throws.
     *
     * On ArangoDB versions prior to 3.12.9, `ensureIndex` blocks until training is complete, so
     * this timeout is not relevant.
     *
     * Defaults to 600 000 ms (10 minutes).
     */
    readonly vectorIndexTrainingTimeoutMs?: number;
}

export function initDatabase(config: ArangoDBConfig): Database {
    const arangoJSConfig = config.arangoJSConfig ?? {};
    const db = new Database({
        ...arangoJSConfig,
        url: config.url,
        databaseName: config.databaseName,
        auth: config.user
            ? { username: config.user, password: config.password }
            : config.authToken
              ? { token: config.authToken }
              : arangoJSConfig.auth,
    });
    return db;
}

export function getArangoDBLogger(schemaContext: ProjectOptions | undefined): Logger {
    const loggerProvider = schemaContext?.loggerProvider ?? DEFAULT_LOGGER_PROVIDER;
    return loggerProvider.getLogger('ArangoDBAdapter');
}
