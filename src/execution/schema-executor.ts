import { DocumentNode, FragmentDefinitionNode, GraphQLSchema, OperationDefinitionNode, VariableDefinitionNode } from 'graphql';
import { getVariableValues } from 'graphql/execution/values';
import Maybe from 'graphql/tsutils/Maybe';
import { globalContext } from '../config/global';
import { DatabaseAdapter } from '../database/database-adapter';
import { extractOperation } from '../graphql/operations';
import { Project } from '../project/project';
import { InvalidProjectError } from '../project/invalid-project-error';
import { QueryNodeObjectType, SchemaGenerator } from '../schema-generation';
import { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline';
import { validateAndPrepareSchema } from '../schema/schema-builder';
import { arrayToObject } from '../utils/utils';
import { ExecutionOptions } from './execution-options';
import { ExecutionResult } from './execution-result';
import { OperationResolver } from './operation-resolver';
import { SchemaExecutionArgs } from './schema-executor';

type ValidationResult = { readonly canExecute: false, errorMessage: string } | SuccessfulValidationResult

interface SuccessfulValidationResult {
    readonly canExecute: true,
    readonly errorMessage: undefined,
    readonly fragmentMap: { readonly [name: string]: FragmentDefinitionNode },
    readonly operation: OperationDefinitionNode,
    readonly variableValues: { [key: string]: any } | undefined
}

export interface SchemaExecutionArgs {
    readonly document: DocumentNode;
    readonly contextValue?: any;
    readonly variableValues?: Maybe<{ [key: string]: any }>;
    readonly operationName?: Maybe<string>;

    /**
     * additional information relevant for execution. If not specified, it is taken from the project's options callback
     * */
    readonly options?: ExecutionOptions
}

/**
 * Experimental API, lacks of significant features like validation or introspection
 */
export class SchemaExecutor {
    private readonly queryType: QueryNodeObjectType;
    private readonly mutationType: QueryNodeObjectType;
    private readonly dumbSchema: GraphQLSchema;
    private readonly resolver: OperationResolver;

    constructor(private readonly project: Project, private readonly databaseAdapter: DatabaseAdapter) {
        const context: SchemaTransformationContext = {
            loggerProvider: project.loggerProvider,
            databaseAdapter: databaseAdapter,
            getExecutionOptions: project.options.getExecutionOptions
        };

        globalContext.registerContext(context);
        try {
            const logger = globalContext.loggerProvider.getLogger('schema-builder');

            const { validationResult, model } = validateAndPrepareSchema(project);
            if (validationResult.hasErrors()) {
                throw new InvalidProjectError(validationResult);
            }

            const schemaContext: SchemaTransformationContext = {
                ...project.options,
                databaseAdapter
            };

            const generator = new SchemaGenerator(schemaContext);
            const { dumbSchema, queryType, mutationType } = generator.generateTypesAndDumbSchema(model);

            this.resolver = new OperationResolver(context);
            this.queryType = queryType;
            this.mutationType = mutationType;
            this.dumbSchema = dumbSchema;
        } finally {
            globalContext.unregisterContext();
        }
    }

    /**
     * Determines if a given operation can be executed by this executor
     *
     * @return the info whether it is executable, and if not, why.
     */
    canExecute(operation: SchemaExecutionArgs): { readonly canExecute: boolean, readonly errorMessage?: string } {
        const result = this.validate(operation);
        return {
            canExecute: result.canExecute,
            errorMessage: result.errorMessage
        };
    }

    /**
     * Executes a GraphQL query without running the GraphQL engine if possible
     * @return a promise to the execution result if possible, undefined if the query can not be evaluated
     */
    tryExecute(args: SchemaExecutionArgs): Promise<ExecutionResult> | undefined {
        const result = this.validate(args);
        if (!result.canExecute) {
            return undefined;
        }
        const { fragmentMap, operation, variableValues } = result;

        const rootType = operation.operation === 'mutation' ? this.mutationType : this.queryType;
        return this.resolver.resolveOperation({
            context: args.contextValue,
            operation,
            fragments: fragmentMap,
            schema: this.dumbSchema,
            variableValues: variableValues || {}
        }, rootType, args.options);
    }

    private validate(args: SchemaExecutionArgs): ValidationResult {
        const operation = extractOperation(args.document, args.operationName);
        // TODO check for introspection in fragments
        if (operation.selectionSet.selections.some(sel => sel.kind === 'Field' && sel.name.value.startsWith('__'))) {
            // contains introspection query
            return { canExecute: false, errorMessage: 'query contains introspection fields' };
        }
        const fragments = args.document.definitions.filter(def => def.kind === 'FragmentDefinition') as ReadonlyArray<FragmentDefinitionNode>;
        const fragmentMap = arrayToObject(fragments, fr => fr.name.value);

        // this is a deep import, might want to import the function
        const { coerced: variableValues, errors: variableErrors } = getVariableValues(this.dumbSchema, operation.variableDefinitions as VariableDefinitionNode[] || [], args.variableValues || {});
        if (variableErrors) {
            return { canExecute: false, errorMessage: 'variable values are invalid' };
        }

        return { canExecute: true, errorMessage: undefined, fragmentMap, operation, variableValues };
    }
}
