import { assertLeafType, GraphQLError, print } from 'graphql';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { globalContext } from '../config/global';
import { RequestProfile } from '../config/interfaces';
import { ExecutionPlan, TransactionStats } from '../database/database-adapter';
import { OperationParams } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
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

        const needsTimings = profileConsumer || options.recordPlan || options.recordTimings;
        const watch = needsTimings ? new Watch() : undefined;
        const topLevelWatch = needsTimings ? new Watch() : undefined;

        const operationDesc = `${operationInfo.operation.operation} ${operationInfo.operation.name ? operationInfo.operation.name.value : ''}`;
        const start = needsTimings ? getPreciseTime() : undefined;
        if (operationInfo.operation.operation === 'mutation' && options.mutationMode === 'disallowed') {
            throw new Error(`Mutations are not allowed`);
        }

        let queryTree: QueryNode;
        try {
            const requestRoles = options.authRoles || [];
            logger.debug(`Executing ${operationDesc} with roles ${requestRoles.join(', ')}`);
            if (logger.isTraceEnabled()) {
                logger.trace(`Operation: ${print(operationInfo.operation)}`);
            }
            const operation = distillOperation(operationInfo);
            if (logger.isTraceEnabled()) {
                logger.trace(`DistilledOperation: ${operation.describe()}`);
            }
            if (watch) {
                watch.stop('distillation');
            }

            const rootQueryNode = ObjectQueryNode.EMPTY; // can't use NULL because then the whole operation would yield null
            queryTree = buildConditionalObjectQueryNode(rootQueryNode, rootType, operation.selectionSet);
            if (logger.isTraceEnabled()) {
                logger.trace('Before authorization: ' + queryTree.describe());
            }
            if (watch) {
                watch.stop('queryTree');
            }
            queryTree = applyAuthorizationToQueryTree(queryTree, { authRoles: requestRoles });
            if (logger.isTraceEnabled()) {
                logger.trace('After authorization: ' + queryTree.describe());
            }
            if (watch) {
                watch.stop('authorization');
            }
        } finally {
            globalContext.unregisterContext();
        }
        let dbAdapterTimings;
        let stats: TransactionStats = {};
        let plan: ExecutionPlan | undefined;
        let error: Error | undefined;
        let { canEvaluateStatically, result: data } = evaluateQueryStatically(queryTree);
        if (watch && topLevelWatch) {
            watch.stop('staticEvaluation');
            topLevelWatch.stop('preparation');
        }
        if (!canEvaluateStatically) {
            const res = this.context.databaseAdapter.executeExt ? (await this.context.databaseAdapter.executeExt({
                queryTree,
                ...options
            })) : {
                data: this.context.databaseAdapter.execute(queryTree)
            };
            if (topLevelWatch) {
                topLevelWatch.stop('database');
            }
            dbAdapterTimings = res.timings;
            error = res.error;
            data = res.data;
            plan = res.plan;
            if (res.stats) {
                stats = res.stats;
            }
            if (error) {
                logger.debug(`Executed ${operationDesc} with error: ${error.stack}`);
            } else {
                logger.debug(`Executed ${operationDesc} successfully`);
            }
        } else {
            logger.debug(`Executed ${operationDesc} (evaluated statically without database adapter))`);
        }
        if (logger.isTraceEnabled()) {
            logger.trace('Result: ' + JSON.stringify(data, undefined, '  '));
        }
        let profile: RequestProfile | undefined;
        if (watch && topLevelWatch && (start != undefined)) { // equivalent to (profileConsumer || options.recordPlan || options.recordTimings) but pleases typescript
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
                stats,
                context: operationInfo.context,
                operation: operationInfo.operation,
                variableValues: operationInfo.variableValues,
                fragments: operationInfo.fragments
            };
        }
        return {
            data,
            error,
            profile
        };
    }
}
