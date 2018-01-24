import { SchemaTransformationContext, SchemaTransformer } from '../transformation-pipeline';
import { GraphQLSchema, print } from 'graphql';
import { evaluateQueryStatically } from '../../../query/static-evaluation';
import { globalContext } from '../../../config/global';
import { distillOperation } from '../../../graphql/query-distiller';
import { QueryNode } from '../../../query/definition';
import { createQueryTree } from '../../../query/query-tree-builder';
import { applyAuthorizationToQueryTree } from '../../../authorization/execution';
import { addOperationBasedResolvers } from '../../../graphql/operation-based-resolvers';

/**
 * Adds resolvers on operation level that actually execute an operation via the databaseAdapter
 */
export class AddOperationResolversTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema, context: SchemaTransformationContext) {
        return addOperationBasedResolvers(schema, async operationInfo => {
            globalContext.registerContext(context);
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
                    result = await context.databaseAdapter.execute(queryTree);
                }
                logger.debug('Evaluated query successfully: ' + JSON.stringify(result, undefined, '  '));
                return result;
            } catch (e) {
                logger.error("Error evaluating GraphQL query: " + e.stack);
                throw e;
            }
        });
    }
}

function getRequestRoles(context: any): string[] {
    return context.authRoles || [];
}
