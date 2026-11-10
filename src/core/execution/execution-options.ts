import type { OperationDefinitionNode } from 'graphql';
import type { AuthContext } from '../authorization/auth-basics.js';

export type MutationMode = 'normal' | 'disallowed' | 'rollback';

export interface ExecutionOptions {
    /**
     * If set to true, no authorization checks will be done and all objects will be readable and writeable
     */
    readonly disableAuthorization?: boolean;

    /**
     * Authorization information that should be used for applying restrictions
     */
    readonly authContext?: AuthContext;

    readonly locale?: LocaleInfo;

    /**
     * Specifies if mutations will be executed ('normal'), will cause an error ('disallowed'), or will be executed in
     * a protected transaction which will be instantly rolled back ('rollback').
     *
     * If undefined, defaults to 'normal'.
     */
    readonly mutationMode?: MutationMode;

    /**
     * Specifies if detailed timing information should be recorded and included in the request profile
     *
     * If undefined, defaults to false.
     */
    readonly recordTimings?: boolean;

    /**
     * Specifies if the execution plan should be included in the request profile
     *
     * If undefined, defaults to false.
     */
    readonly recordPlan?: boolean;

    /**
     * Specifies if the plans the query optimizer considered but discarded should be included in the request profile
     * (in addition to the chosen plan). Only has an effect if recordPlan or explainOnly is set.
     *
     * Recording discarded plans requires an additional explain step for each query of the transaction, and the
     * number of plans can grow large for complex queries (up to the optimizer's maxNumberOfPlans), which makes
     * planning slower and increases memory usage. If set to false, only the chosen plan is recorded.
     *
     * If undefined, defaults to true. The default will change to false in the next major version.
     */
    readonly recordDiscardedPlans?: boolean;

    /**
     * If set to true, the queries are only planned, but not executed. Use this to inspect execution plans without
     * reading or writing any data.
     *
     * Each query of the transaction is passed to ArangoDB's explain API. No transaction is started, so nothing is
     * written, also for mutations. mutationMode has no effect, except that 'disallowed' still rejects mutations.
     * Authorization is applied as usual.
     *
     * Implies recordPlan: the request profile's plan contains the plan, the discarded plans (unless
     * recordDiscardedPlans is false) and the warnings of each query, but no execution stats. Query result validators
     * (e.g. the check that an entity to update exists) are not run.
     *
     * The result has no data. Runtime errors that are part of the data (e.g. permission denied errors) are
     * therefore not reported, but can be seen in the explained queries. When executed via a GraphQL schema, all
     * root fields resolve to null, so non-nullable root fields cause GraphQL errors. Use the SchemaExecutor or the
     * profileConsumer to get the plan. Operations that can be evaluated without the database still yield their data
     * (and no plan).
     *
     * Bind parameters that would carry results of earlier queries of the same transaction are bound to null (see
     * ExecutionPlanTransactionStep.placeholderBindVars). The optimizer would fold these constants (and e.g. reject
     * null as the operand of a FOR loop), so the explained query wraps these bind parameters in NOEVAL(). The plan
     * therefore can differ from the plan of an actual execution, where the optimizer knows the values.
     *
     * When recordTimings is set, timings.database and timings.dbConnection both contain the total time spent on the
     * explain requests. transactionTimeoutMs is not applied, and the cancellationToken is only checked between
     * queries.
     *
     * Not supported by the InMemoryAdapter (it throws an error).
     *
     * If undefined, defaults to false.
     */
    readonly explainOnly?: boolean;

    /**
     * The memory limit in bytes to impose on individual ArangoDB queries (does not apply to the whole ArangoDB transaction)
     */
    readonly queryMemoryLimit?: number;

    /**
     * A promise that, when resolved, cancels the running operation. If the promise is resolved after the operation is
     * completed, or the promise is rejected, nothing happens.
     */
    readonly cancellationToken?: Promise<void>;

    /**
     * The time in milliseconds after which a running transaction will be cancelled.
     *
     * When using the ArangoDBDatabase, this timeout only starts when the request is actually sent to ArangoDB, and not
     * while it is in the request queue. Use cancellationToken with setTimeout() to set a overall timeout.
     */
    readonly transactionTimeoutMs?: number;

    /**
     * The maximum amount of objects that can be filtered using a postFilter or sorted in an ArangoSearch query
     */
    readonly flexSearchMaxFilterableAndSortableAmount?: number;

    /**
     * How many steps of recursive fields are indexed and allowed in queries for FlexSearch.
     */
    readonly flexSearchRecursionDepth?: number;

    /**
     * A child entity update operation with this number of updates or more will use the "dict"
     * strategy that converts the list into a dictionary before applying the updates first
     *
     * If not specified, a reasonable default will be used
     */
    readonly childEntityUpdatesViaDictStrategyThreshold?: number;

    readonly timeToLiveOptions?: TimeToLiveExecutionOptions;

    /**
     * If true, __typename fields will be resolved to their values. Only needed if executed outside of a regular graphql engine
     */
    readonly handleTypenameFields?: boolean;

    /**
     * The maximum number of elements to delete in one ttl-cleanup
     * @deprecated use timeToLiveOptions
     */
    readonly timeToLiveCleanupLimit?: number;

    /**
     * The amount of days until an element is shown as overdue in the ttl-info
     * @deprecated use timeToLiveOptions
     */
    readonly timeToLiveOverdueDelta?: number;

    /**
     * An interface to determine the current date/time. If not specified, system time is used
     */
    readonly clock?: Clock;

    /**
     * An interface to generate IDs, e.g. for new child entities. If not specified, random UUIDs
     * will be used.
     */
    readonly idGenerator?: IDGenerator;

    /**
     * The maximum number of items that can be handled in a list-based root entity query/mutation.
     *
     * When then caller specifies a limit (via the "first" argument) higher than this number an error is thrown prompting to reduce the limit.
     *
     * No checks are applied on explicit limits when this option is not set.
     *
     * It is applied to the following queries:
     *  - flexSearchAll\<RootEntityPluralName>
     *  - all\<RootEntityPluralName>
     *  - vectorSearch\<RootEntityPluralName>
     *
     * It is applied to the following mutations:
     *  - updateAll\<RootEntityPluralName>
     *  - deleteAll\<RootEntityPluralName>
     */
    readonly maxLimitForRootEntityQueries?: number;

    /**
     * The implicit maximum number of items that can be handled in a list-based root entity query/mutation.
     *
     * In contrast to `maxLimitForRootEntityQueries` this ensures that no more than the specified number of
     * elements will be modified/queried on the affected queries/mutation when no explicit limit is set (via the "first" argument).
     *
     * When the limit is exceeded an error is thrown indicating to manually set a higher limit or explicitly
     * truncate the available elements.
     *
     * No checks are applied when this option is not set.
     *
     * It is applied to the following queries:
     *  - flexSearchAll\<RootEntityPluralName>
     *  - all\<RootEntityPluralName>
     *
     * It is applied to the following mutations:
     *  - updateAll\<RootEntityPluralName>
     *  - deleteAll\<RootEntityPluralName>
     *
     */
    readonly implicitLimitForRootEntityQueries?: number;

    /**
     * The maximum number of document attributes per FOR loop to be used as projections.
     *
     * When set, emits `OPTIONS { maxProjections: <value> }` on every FOR loop that directly
     * iterates a document collection or performs a graph traversal in ArangoDB AQL.
     *
     * This is a trade-off. A high number of projections cause many variables in the query,
     * which can slow down query planning and execution. Not using projection (because the
     * threshold is exceeded) however means that full documents need to be read into memory,
     * including fields that are not needed in the query. This can increase query memory usage
     * significantly.
     *
     * The ArangoDB default (when unset) is 5.
     *
     * Has no effect when using the InMemoryAdapter.
     *
     * See https://docs.arango.ai/arangodb/stable/aql/high-level-operations/for/#maxprojections for details.
     */
    readonly maxProjections?: number;
}

export interface TimeToLiveExecutionOptions {
    /**
     * The maximum number of elements to delete in one ttl-cleanup
     */
    readonly cleanupLimit?: number;

    /**
     * If set to true, a cleanup query will automatically be retried with a lower cleanupLimit when the previous one
     * failed due to a time or memory limit
     *
     * The limit will continuously be halved until it is 1, then the error will be thrown. One execution will still
     */
    readonly reduceLimitOnResourceLimits?: boolean;

    /**
     * The amount of days until an element is shown as overdue in the ttl-info
     */
    readonly overdueDelta?: number;
}

export interface ExecutionOptionsCallbackArgs {
    /**
     * The GraphQL context value
     */
    readonly context: any;

    /**
     * The AST node of the operation being executed
     */
    readonly operationDefinition: OperationDefinitionNode;
}

export interface LocaleInfo {
    /**
     * An array of languages or languages with region (e.g. de-DE) in order of decreasing priority
     */
    readonly acceptLanguages?: ReadonlyArray<string>;
}

export interface Clock {
    /**
     * Gets an ISO string for the current date/time in UTC
     */
    getCurrentTimestamp(): string;
}

/**
 * A class that implements the Clock interface and uses the system time
 */
export class DefaultClock implements Clock {
    getCurrentTimestamp(): string {
        return new Date().toISOString();
    }
}

export type IDGenerationTarget = 'root-entity' | 'child-entity';

export interface IDGenerationInfo {
    readonly target: IDGenerationTarget;

    // we can't easily pass the RootEntityType instance at runtime in the InMemoryAdapter,
    // hence we only pass the name. For consistency, only pass the name in both root and child entity case
    /**
     * The name of the root or child entity type
     */
    readonly typeName: string;
}

export interface IDGenerator {
    /**
     * Generate an id that will be used for some entities (e.g. child entities)
     */
    generateID(info: IDGenerationInfo): string;
}

export class UUIDGenerator implements IDGenerator {
    /**
     * Generates a random UUID
     */
    generateID(): string {
        return crypto.randomUUID();
    }
}
