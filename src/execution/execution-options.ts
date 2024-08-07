import { OperationDefinitionNode } from 'graphql';
import { v4 as uuidv4 } from 'uuid';
import { AuthContext } from '../authorization/auth-basics';

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
        return uuidv4();
    }
}
