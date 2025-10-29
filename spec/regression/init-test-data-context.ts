import { DocumentNode, GraphQLSchema } from 'graphql';
import { ExecutionResult } from 'graphql';
import { graphql, print } from 'graphql/index';

export interface ExecuteGraphqlOptions {
    readonly variables?: { readonly [variable: string]: unknown };

    /**
     * @default true
     */
    readonly assertNoErrors?: boolean;

    readonly authRoles?: ReadonlyArray<string>;

    readonly claims?: { readonly [variable: string]: string | ReadonlyArray<string> };
}

export class InitTestDataContext {
    constructor(private readonly schema: GraphQLSchema) {}

    async executeGraphql(
        document: DocumentNode | string,
        options: ExecuteGraphqlOptions = {},
    ): Promise<ExecutionResult> {
        const assertNoErrors = options.assertNoErrors ?? true;
        const contextValue = {
            authRoles: options.authRoles || [],
            claims: options.claims,
        };
        const source =
            typeof document === 'string'
                ? document
                : (document.loc?.source.body ?? print(document));
        const operations =
            typeof document === 'object'
                ? document.definitions.filter((d) => d.kind === 'OperationDefinition')
                : [];
        const operationName = operations.length === 1 ? operations[0].name?.value : undefined;
        const result = await graphql({
            schema: this.schema,
            source,
            rootValue: {},
            contextValue,
            variableValues: options.variables,
        });

        if (assertNoErrors && result.errors) {
            throw new Error(
                `GraphQL error${operationName ? ` in ${operationName}` : ''}: ${JSON.stringify(result.errors)}`,
            );
        }

        return result;
    }
}
