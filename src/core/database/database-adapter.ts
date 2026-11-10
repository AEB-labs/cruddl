import type { ExecutionOptions } from '../execution/execution-options.js';
import type { Model } from '../model/implementation/model.js';
import type { QueryNode } from '../query-tree/base.js';
import type { FlexSearchTokenization } from '../query-tree/flex-search.js';

/**
 * Times (in seconds) spent on specific parts of execution
 */
export interface DatabaseAdapterTimings {
    readonly preparation: {
        /**
         * Complete time for preparation in the adapter
         */
        total: number;

        readonly [key: string]: number;
    };

    readonly dbConnection: {
        /**
         * Complete time time spent on the database connection (from queuing to having received the response). Subsumes the database section.
         */
        readonly total: number;

        /**
         * Additional, database-adapter-specific profiling times
         */
        readonly [key: string]: number;
    };

    readonly database: {
        /**
         * Complete time spent waiting for the database
         */
        readonly total: number;

        /**
         * Additional, database-adapter-specific profiling times
         */
        readonly [key: string]: number;
    };
}

export interface ExecutionResult {
    /**
     * The data result of executing the query
     */
    readonly data?: any;

    /**
     * If this is set, an error occurred, and data may be undefined.
     *
     * Errors are thrown normally, but if recordPlans is enabled, errors still generate a proper result with
     * all previously gathered plan data.
     */
    readonly error?: Error;

    /**
     * Times (in seconds) spent on specific parts of execution. Only included if recordTimings is set to true.
     */
    readonly timings?: DatabaseAdapterTimings;

    readonly plan?: ExecutionPlan;

    readonly stats?: TransactionStats;
}

export interface ExecutionPlan {
    readonly queryTree: QueryNode;

    readonly transactionSteps: ReadonlyArray<ExecutionPlanTransactionStep>;
}

interface Plan {
    nodes: ReadonlyArray<{
        type: string;
        dependencies: ReadonlyArray<number>;
        id: number;
        estimatedCost: number;
        estimatedNrItems: number;
        [key: string]: any;
    }>;
    /**
     * The names of the optimizer rules that were applied to the plan
     */
    rules: ReadonlyArray<string>;
    collections: ReadonlyArray<{
        name: string;
        type: string;
    }>;
    variables: ReadonlyArray<{
        id: number;
        name: string;
    }>;
    estimatedCost: number;
    estimatedNrItems: number;

    /**
     * @deprecated ArangoDB does not return this field, so it is always undefined
     */
    initialize: boolean;

    isModificationQuery: boolean;
}

export interface TransactionStats {
    readonly peakQueryMemoryUsage?: number;
    readonly retries?: number;
}

export interface ExecutionPlanTransactionStep {
    readonly query: string;
    readonly boundValues: { [p: string]: any };

    /**
     * Only set if explainOnly is used: the names of bind parameters that would have been set to results of previous
     * transaction steps. Because nothing is executed, they are bound to null instead, and the explained query wraps
     * them in NOEVAL() (query contains the original code).
     */
    readonly placeholderBindVars?: ReadonlyArray<string>;

    readonly plan?: Plan;

    /**
     * The plans the optimizer considered but discarded. Only set if recordDiscardedPlans is not false.
     */
    readonly discardedPlans?: ReadonlyArray<Plan>;

    readonly stats?: {
        readonly nodes?: ReadonlyArray<{
            id: number;
            calls: number;
            items: number;

            /**
             * The number of items this node filtered out
             */
            readonly filtered?: number;

            /**
             * The time (in seconds) spent in this node and all its dependencies
             */
            runtime: number;

            /**
             * The time (in seconds) this node spent waiting for its dependencies
             */
            readonly fetching?: number;
        }>;
        writesExecuted: number;
        writesIgnored: number;

        /**
         * The number of documents that were read via a full collection scan
         */
        readonly scannedFull?: number;

        /**
         * @deprecated misspelled, always undefined. Use scannedFull instead.
         */
        scannedFul: number;

        /**
         * The number of index entries that were read
         */
        scannedIndex: number;

        /**
         * The number of documents that were loaded after an index lookup
         */
        readonly documentLookups?: number;

        /**
         * The number of seek operations on indexes
         */
        readonly seeks?: number;

        /**
         * The number of index cursors that were created
         */
        readonly cursorsCreated?: number;

        /**
         * The number of times existing index cursors were reused for a new lookup value
         */
        readonly cursorsRearmed?: number;

        /**
         * The number of lookups served from the in-memory edge or index cache
         */
        readonly cacheHits?: number;

        /**
         * The number of lookups that could not be served from the in-memory edge or index cache
         */
        readonly cacheMisses?: number;

        filtered: number;
        httpRequests: number;

        /**
         * The number of intermediate commits the query performed
         */
        readonly intermediateCommits?: number;

        /**
         * The number of documents that would have been returned without the last LIMIT. Only present if the
         * fullCount option was set.
         */
        readonly fullCount?: number;

        /**
         * The time (in seconds) the query took
         */
        executionTime: number;

        /**
         * The maximum memory (in bytes) the query used
         */
        peakMemoryUsage?: number;
    };

    readonly warnings?: ReadonlyArray<{
        /**
         * The ArangoDB error number of the warning (e.g. 1562 for "division by zero")
         */
        code: number;
        message: string;
    }>;

    /**
     * Times (in seconds) spent in the phases of query execution (e.g. "parsing", "optimizing plan", "executing")
     */
    readonly profile?: { [key: string]: number };

    /**
     * @deprecated never populated. Use stats.peakMemoryUsage instead.
     */
    readonly peakMemoryUsage?: number;

    /**
     * The GraphQL fields the variables of this transaction step's query originate from, keyed by
     * the variable name as it appears in the query (and in the outVariable of the plan nodes)
     *
     * Variables that do not originate from a specific GraphQL field (e.g. variables introduced for
     * authorization) are not included. Only set if recordPlan or explainOnly is enabled and the query was
     * generated from a GraphQL operation.
     */
    readonly variableOrigins?: { readonly [aqlVariableName: string]: FieldOrigin };
}

/**
 * Describes a field within a GraphQL operation
 */
export interface FieldOrigin {
    /**
     * The response keys (aliases or field names) from the operation root to this field
     *
     * Example: ['Consignment', 'deliveries']
     */
    readonly path: ReadonlyArray<string>;

    /**
     * The name of the GraphQL type that declares the field
     */
    readonly parentTypeName: string;

    /**
     * The name of the field in the schema (not the alias)
     */
    readonly fieldName: string;

    /**
     * The start of the field in the operation's source (1-based line and column)
     *
     * If the field is selected within a fragment, this is the location within the fragment.
     */
    readonly loc?: { readonly line: number; readonly column: number };
}

/**
 * Maps the indices of query tree variables (VariableQueryNode.index) to the GraphQL fields they
 * originate from
 */
export interface QueryTreeVariableOrigins {
    getOrigin(variableIndex: number): FieldOrigin | undefined;
}

export interface ExecutionArgs extends ExecutionOptions {
    /**
     * The query to execute
     */
    readonly queryTree: QueryNode;

    /**
     * The name of the GraphQL operation the query belongs to, if any
     *
     * The ArangoDBAdapter includes it in a comment in the AQL queries so it shows up in the lists of slow and
     * running queries. Characters that are not valid in GraphQL names are replaced by underscores.
     */
    readonly operationName?: string;

    /**
     * The GraphQL fields the variables in queryTree originate from
     *
     * Database adapters can use this to populate ExecutionPlanTransactionStep.variableOrigins.
     */
    readonly queryTreeVariableOrigins?: QueryTreeVariableOrigins;
}

export interface DatabaseAdapter {
    /**
     * Executes a query
     */
    execute(queryTree: QueryNode): Promise<any>;

    /**
     * Executes a query (with more options)
     * @param args
     */
    executeExt?(args: ExecutionArgs): Promise<ExecutionResult>;

    /**
     * Performs schema migrations if necessary
     */
    updateSchema(schema: Model): Promise<void>;

    /**
     * Tokenizes a List of expressions
     */
    tokenizeExpressions(
        tokenizations: ReadonlyArray<FlexSearchTokenizable>,
    ): Promise<ReadonlyArray<FlexSearchTokenization>>;
}

export interface FlexSearchTokenizable {
    expression: string;
    analyzer: string;
}
