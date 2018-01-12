import { GraphQLSchema, print, ResponsePath } from 'graphql';
import { DatabaseAdapter } from '../database/database-adapter';
import { addOperationBasedResolvers } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { createQueryTree } from './query-tree-builder';
import { addAliasBasedResolvers } from '../graphql/alias-based-resolvers';
import { globalContext, SchemaContext } from '../config/global';
import { QueryNode } from './definition';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { evaluateQueryStatically } from './static-evaluation';
import { addRuntimeErrorResolvers } from './runtime-errors';

export function addQueryResolvers(schema: GraphQLSchema, databaseAdapter: DatabaseAdapter, schemaContext?: SchemaContext) {
    globalContext.registerContext(schemaContext);
    try {
        // this is needed because the query tree already does the alias handling and stores the values in the places where
        // the user expects it - GraphQL should not mess with this by using the *field* instead of the alias in the resolvers
        // do this first because addOperationBasedResolvers supports resolver chaining and this one does not (how would it)
        schema = addAliasBasedResolvers(schema);

        schema = addOperationBasedResolvers(schema, async operationInfo => {
            globalContext.registerContext(schemaContext);
            const logger = globalContext.loggerProvider.getLogger('query-resolvers');
            try {
                let queryTree: QueryNode;
                try {
                    logger.debug(`Executing operation ${print(operationInfo.operation)}`);
                    const operation = distillOperation(operationInfo);
                    logger.debug(operation.describe());

                    const requestRoles = getRequestRoles(operationInfo.context);
                    logger.debug(`Request roles: ${requestRoles.join(', ')}`);
                    queryTree = createQueryTree(operation);
                    logger.debug('Before authorization: ' + queryTree.describe());
                    queryTree = applyAuthorizationToQueryTree(queryTree, { authRoles: requestRoles});
                    logger.debug('After authorization: ' + queryTree.describe());
                } finally {
                    globalContext.unregisterContext();
                }
                let { canEvaluateStatically, result } = evaluateQueryStatically(queryTree);
                if (!canEvaluateStatically) {
                    result = await databaseAdapter.execute(queryTree);
                }
                logger.debug('Evaluated query successfully');
                return result;
            } catch (e) {
                logger.error("Error evaluating GraphQL query: " + e.stack);
                throw e;
            }
        });

        // Make sure runtime errors are thrown as GraphQL errors
        schema = addRuntimeErrorResolvers(schema);

        return schema;
    } finally {
        globalContext.unregisterContext();
    }
}

function getRequestRoles(context: any): string[] {
    return context.authRoles || [];
}
