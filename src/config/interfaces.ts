import { FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
import { DatabaseAdapterTimings, ExecutionPlan, TransactionStats } from '../database/database-adapter';
import { ExecutionOptions, ExecutionOptionsCallbackArgs } from '../execution/execution-options';
import { LoggerProvider } from './logging';

export interface RequestContext {
    readonly operation: OperationDefinitionNode;
    readonly variableValues: { readonly [name: string]: unknown }
    readonly fragments: { readonly [fragmentName: string]: FragmentDefinitionNode }
    readonly context: unknown;
}

export interface RequestProfile extends RequestContext {
    readonly timings?: DatabaseAdapterTimings;
    readonly stats: TransactionStats
    readonly plan?: ExecutionPlan;
}

export interface SchemaOptions {
    /**
     * The maximum depth root entities can be traversed through for orderBy values
     */
    readonly maxOrderByRootEntityDepth?: number;
}

export interface ProjectOptions {
    readonly loggerProvider?: LoggerProvider;
    readonly profileConsumer?: (profile: RequestProfile) => void;
    readonly getExecutionOptions?: (args: ExecutionOptionsCallbackArgs) => ExecutionOptions;

    readonly schemaOptions?: SchemaOptions

    /**
     * Is called when an operation execution throws an error
     *
     * If error is a GraphQLError, it's a validation error
     *
     * @return the error that should be passed to the graphql engine
     */
    processError?(error: Error, context: RequestContext): Error;
}
