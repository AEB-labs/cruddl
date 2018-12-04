import { QueryNode } from '../query-tree';
import { Model } from '../model';

/**
 * Times (in seconds) spent on specific parts of execution
 */
export interface DatabaseAdapterTimings {
    readonly preparation: {
        /**
         * Complete time for preparation in the adapter
         */
        total: number;

        readonly [key:string]: number;
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
    }

    readonly database: {
        /**
         * Complete time spent waiting for the database
         */
        readonly total: number;

        /**
         * Additional, database-adapter-specific profiling times
         */
        readonly [key: string]: number;
    }
}

export interface ExecutionResult {
    /**
     * The data result of executing the query
     */
    readonly data: any;

    /**
     * Times (in seconds) spent on specific parts of execution. Only included if recordTimings is set to true.
     */
    readonly timings?: DatabaseAdapterTimings
}

export interface ExecutionOptions {
    /**
     * The query to execute
     */
    readonly queryTree: QueryNode;

    /**
     * If set to true, timings will be included in the result
     */
    readonly recordTimings?: boolean;
}

export interface DatabaseAdapter {
    /**
     * Executes a query
     */
    execute(queryTree: QueryNode): Promise<any>;

    /**
     * Executes a query (with more options)
     * @param options
     */
    executeExt?(options: ExecutionOptions): Promise<ExecutionResult>;

    /**
     * Performs schema migrations if necessary
     */
    updateSchema(schema: Model): Promise<void>;
}
