import { SchemaTransformationContext, SchemaTransformer } from '../transformation-pipeline';
import { GraphQLSchema, print } from 'graphql';
import { evaluateQueryStatically } from '../../../query/static-evaluation';
import { globalContext } from '../../../config/global';
import { distillOperation } from '../../../graphql/query-distiller';
import { QueryNode } from '../../../query/definition';
import { createQueryTree } from '../../../query/query-tree-builder';
import { applyAuthorizationToQueryTree } from '../../../authorization/execution';
import { addOperationBasedResolvers } from '../../../graphql/operation-based-resolvers';
import { Model } from '../../../model';

/**
 * Adds resolvers on operation level that actually execute an operation via the databaseAdapter
 */
export class AddOperationResolversTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema, context: SchemaTransformationContext, model: Model) {
        return addOperationBasedResolvers(schema, async operationInfo => {
            globalContext.registerContext(context);
            const logger = globalContext.loggerProvider.getLogger('query-resolvers');
            try {
                let queryTree: QueryNode;
                try {
                    logger.debug(`Executing ${operationInfo.operation.operation} ${operationInfo.operation.name ? operationInfo.operation.name.value : ''}`);
                    if (logger.isTraceEnabled()) {
                        logger.trace(`Operation: ${print(operationInfo.operation)}`);
                    }
                    const operation = distillOperation(operationInfo);
                    if (logger.isTraceEnabled()) {
                        logger.trace(`DistilledOperation: ${operation.describe()}`);
                    }

                    const requestRoles = getRequestRoles(operationInfo.context);
                    logger.debug(`Request roles: ${requestRoles.join(', ')}`);
                    queryTree = createQueryTree(operation, model);
                    if (logger.isTraceEnabled()) {
                        logger.trace('Before authorization: ' + queryTree.describe());
                    }
                    queryTree = applyAuthorizationToQueryTree(queryTree, { authRoles: requestRoles});
                    if (logger.isTraceEnabled()) {
                        logger.trace('After authorization: ' + queryTree.describe());
                    }
                } finally {
                    globalContext.unregisterContext();
                }
                let { canEvaluateStatically, result } = evaluateQueryStatically(queryTree);
                if (!canEvaluateStatically) {
                    result = await context.databaseAdapter.execute(queryTree);
                    logger.debug(`Execution successful`)
                } else {
                    logger.debug(`Execution successful (evaluated statically without database adapter))`);
                }
                if (logger.isTraceEnabled()) {
                    logger.trace('Result: ' + JSON.stringify(result, undefined, '  '));
                }
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
