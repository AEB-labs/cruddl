import { FragmentDefinitionNode, GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { DatabaseAdapterTimings, ExecutionPlan, TransactionStats } from '../database/database-adapter';
import { ExecutionOptions, ExecutionOptionsCallbackArgs } from '../execution/execution-options';
import { FieldResolverParameters } from '../graphql/operation-based-resolvers';
import { LoggerProvider } from './logging';

export interface RequestContext {
    readonly operation: OperationDefinitionNode;
    readonly variableValues: { readonly [name: string]: unknown };
    readonly fragments: { readonly [fragmentName: string]: FragmentDefinitionNode };
    readonly context: unknown;
    readonly schema: GraphQLSchema;
}

export interface RequestProfile extends RequestContext {
    readonly timings?: DatabaseAdapterTimings;
    readonly stats: TransactionStats;
    readonly plan?: ExecutionPlan;
}

export interface SchemaOptions {
    /**
     * The maximum depth root entities can be traversed through for orderBy values
     */
    readonly maxOrderByRootEntityDepth?: number;
}

export interface ModelValidationOptions {
    /**
     * A list of root entity names that are not allowed.
     */
    readonly forbiddenRootEntityNames?: ReadonlyArray<string>;
}

export interface MigrationOptions {
    /**
     * Skips the check for arangoDB version for arangoSearchMutations.
     * This is required, if a non-root user is used, as only the root-user can check the arangoDB-version.
     */
    readonly skipVersionCheckForArangoSearchMigrations?: boolean;
}

export interface ProjectOptions {
    readonly loggerProvider?: LoggerProvider;
    readonly profileConsumer?: (profile: RequestProfile) => void;
    readonly getExecutionOptions?: (args: ExecutionOptionsCallbackArgs) => ExecutionOptions;

    readonly schemaOptions?: SchemaOptions;
    readonly modelValidationOptions?: ModelValidationOptions;
    readonly migrationOptions?: MigrationOptions;

    /**
     * Should return a token object that is the same for all field resolves of one operation, but different for each
     * operation call.
     *
     * This callback is required to group field requests of operations that include multiple top-level fields as
     * graphql-js offers no reliable way to group these requests together. Cruddl's transactional guarantees can only
     * be kept if it know which field requests belong to one operation.
     *
     * The result must be an object because it is used in a WeakMap so that query results are cleaned up when the
     * operation is complete.
     *
     * If this is not implemented or the callback returns undefined, operations with more than one top-level fields or
     * operations containing top-level fragment spreads will not be supported.
     */
    readonly getOperationIdentifier?: (params: FieldResolverParameters) => object | undefined;

    /**
     * Is called when an operation execution throws an error
     *
     * If error is a GraphQLError, it's a validation error
     *
     * @return the error that should be passed to the graphql engine
     */
    processError?(error: Error, context: RequestContext): Error;
}
