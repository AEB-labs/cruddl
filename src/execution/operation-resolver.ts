import { print } from 'graphql';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { globalContext } from '../config/global';
import { ExecutionPlan } from '../database/database-adapter';
import { OperationParams } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { RequestProfile } from '../project/project';
import { ObjectQueryNode, QueryNode } from '../query-tree';
import { evaluateQueryStatically } from '../query-tree/utils';
import { buildConditionalObjectQueryNode, QueryNodeObjectType } from '../schema-generation/query-node-object-type';
import { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline';
import { getPreciseTime, Watch } from '../utils/watch';
import { ExecutionOptions } from './execution-options';
import { ExecutionResult } from './execution-result';

export class OperationResolver {
    constructor(
        private context: SchemaTransformationContext
    ) {

    }

    async resolveOperation(operationInfo: OperationParams, rootType: QueryNodeObjectType, options?: ExecutionOptions): Promise<ExecutionResult> {
        globalContext.registerContext(this.context);
        let profileConsumer = this.context.profileConsumer;
        const logger = globalContext.loggerProvider.getLogger('query-resolvers');

        if (!options) {
            options = this.context.getExecutionOptions ? this.context.getExecutionOptions({ context: operationInfo.context, operationDefinition: operationInfo.operation }) : {};
        }

        const watch = new Watch();
        const topLevelWatch = new Watch();

        try {
            const start = getPreciseTime();
            if (operationInfo.operation.operation === 'mutation' && options.mutationMode === 'disallowed') {
                throw new Error(`Mutations are not allowed`);
            }

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
                watch.stop('distillation');

                const requestRoles = options.authRoles || [];
                logger.debug(`Request roles: ${requestRoles.join(', ')}`);
                const rootQueryNode = ObjectQueryNode.EMPTY; // can't use NULL because then the whole operation would yield null
                queryTree = buildConditionalObjectQueryNode(rootQueryNode, rootType, operation.selectionSet);
                if (logger.isTraceEnabled()) {
                    logger.trace('Before authorization: ' + queryTree.describe());
                }
                watch.stop('queryTree');
                queryTree = applyAuthorizationToQueryTree(queryTree, { authRoles: requestRoles });
                if (logger.isTraceEnabled()) {
                    logger.trace('After authorization: ' + queryTree.describe());
                }
                watch.stop('authorization');
            } finally {
                globalContext.unregisterContext();
            }
            let dbAdapterTimings;
            let plan: ExecutionPlan | undefined;
            let { canEvaluateStatically, result: data } = evaluateQueryStatically(queryTree);
            watch.stop('staticEvaluation');
            topLevelWatch.stop('preparation');
            if (!canEvaluateStatically) {
                const res = this.context.databaseAdapter.executeExt ? (await this.context.databaseAdapter.executeExt({
                    queryTree,
                    ...options
                })) : {
                    data: this.context.databaseAdapter.execute(queryTree)
                };
                topLevelWatch.stop('database');
                dbAdapterTimings = res.timings;
                data = res.data;
                plan = res.plan;
                logger.debug(`Execution successful`);
            } else {
                logger.debug(`Execution successful (evaluated statically without database adapter))`);
            }
            if (logger.isTraceEnabled()) {
                logger.trace('Result: ' + JSON.stringify(data, undefined, '  '));
            }
            let profile: RequestProfile | undefined ;
            if (profileConsumer || options.recordPlan || options.recordTimings) {
                const preparation = {
                    ...(dbAdapterTimings ? dbAdapterTimings.preparation : {}),
                    ...watch.timings,
                    total: topLevelWatch.timings.preparation
                };
                const timings = {
                    database: dbAdapterTimings ? dbAdapterTimings.database : { total: watch.timings.database },
                    dbConnection: dbAdapterTimings ? dbAdapterTimings.dbConnection : { total: 0 },
                    preparation,
                    total: getPreciseTime() - start
                };
                profile = {
                    timings,
                    plan,
                    context: operationInfo.context,
                    operation: operationInfo.operation
                };
            }
            return {
                data,
                profile
            };
        } catch (e) {
            logger.error('Error evaluating GraphQL query: ' + e.stack);
            throw e;
        }
    }
}
