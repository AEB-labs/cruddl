import { OperationDefinitionNode } from 'graphql';

export type MutationMode = 'normal' | 'disallowed' | 'rollback';

export interface ExecutionOptions {
    /**
     * If set to true, no authorization checks will be done and all objects will be readable and writeable
     */
    readonly disableAuthorization?: boolean;

    /**
     * Role identifiers that apply to the user executing the query. Will be matched against roles in permission profiles.
     *
     * If undefined, defaults to empty array.
     */
    readonly authRoles?: ReadonlyArray<string>;

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
     * The maximum amount of objects that can be filtered (using a normal filter) or sorted in an ArangoSearch query
     */
    readonly flexSearchMaxFilterableAndSortableAmount?: number;

    /**
     * How many steps of recursive fields are indexed and allowed in queries for FlexSearch.
     */
    readonly flexSearchRecursionDepth?: number;

    /**
     * The maximum number of elements to delete in one ttl-cleanup
     */
    readonly timeToLiveCleanupLimit?: number;

    /**
     * The amount of days until an element is shown as overdue in the ttl-info
     */
    readonly timeToLiveOverdueDelta?: number;
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
