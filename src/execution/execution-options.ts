import { OperationDefinitionNode } from 'graphql';

export type MutationMode = 'normal' | 'disallowed' | 'rollback';

export interface ExecutionOptions {
    /**
     * Role identifiers that apply to the user executing the query. Will be matched against roles in permission profiles.
     *
     * If undefined, defaults to empty array.
     */
    readonly authRoles?: ReadonlyArray<string>

    /**
     * Specifies if mutations will be executed ('normal'), will cause an error ('disallowed'), or will be executed in
     * a protected transaction which will be instantly rolled back ('rollback').
     *
     * If undefined, defaults to 'normal'.
     */
    readonly mutationMode?: MutationMode

    /**
     * Specifies if detailed timing information should be recorded and included in the request profile
     *
     * If undefined, defaults to false.
     */
    readonly recordTimings?: boolean

    /**
     * Specifies if the execution plan should be included in the request profile
     *
     * If undefined, defaults to false.
     */
    readonly recordPlan?: boolean

    /**
     * The memory limit in bytes to impose on individual ArangoDB queries (does not apply to the whole ArangoDB transaction)
     */
    readonly queryMemoryLimit?: number
}

export interface ExecutionOptionsCallbackArgs {
    readonly context: any;
    readonly operationDefinition: OperationDefinitionNode
}
