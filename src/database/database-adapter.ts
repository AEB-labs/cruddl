import { ExecutionOptions } from '../execution/execution-options';
import { FlexSearchLanguage, Model } from '../model';
import { QueryNode } from '../query-tree';
import { FlexSearchTokenization } from '../query-tree/flex-search';

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
    rules: ReadonlyArray<any>;
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

    readonly plan?: Plan;
    readonly discardedPlans?: ReadonlyArray<Plan>;

    readonly stats?: {
        readonly nodes?: ReadonlyArray<{
            id: number;
            calls: number;
            items: number;
            runtime: number;
        }>;
        writesExecuted: number;
        writesIgnored: number;
        scannedFul: number;
        scannedIndex: number;
        filtered: number;
        httpRequests: 0;
        executionTime: number;
        peakMemoryUsage?: number;
    };

    readonly warnings?: ReadonlyArray<{
        code: string;
        message: string;
    }>;

    readonly profile?: { [key: string]: number };

    readonly peakMemoryUsage?: number;
}

export interface ExecutionArgs extends ExecutionOptions {
    /**
     * The query to execute
     */
    readonly queryTree: QueryNode;
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
