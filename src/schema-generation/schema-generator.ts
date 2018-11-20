import { GraphQLSchema, print } from 'graphql';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { globalContext } from '../config/global';
import { addOperationBasedResolvers, OperationParams } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { Model } from '../model';
import { ObjectQueryNode, QueryNode } from '../query-tree';
import { evaluateQueryStatically } from '../query-tree/utils';
import { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline';
import { getPreciseTime, Watch } from '../utils/watch';
import { buildConditionalObjectQueryNode, QueryNodeObjectType, QueryNodeObjectTypeConverter } from './query-node-object-type';
import { RootTypesGenerator } from './root-types-generator';

export class SchemaGenerator {
    private readonly rootTypesGenerator = new RootTypesGenerator();
    private readonly queryNodeObjectTypeConverter = new QueryNodeObjectTypeConverter();

    constructor(
        private context: SchemaTransformationContext
    ) {

    }

    generate(model: Model) {
        const queryType = this.rootTypesGenerator.generateQueryType(model);
        const mutationType = this.rootTypesGenerator.generateMutationType(model);
        const dumbSchema = new GraphQLSchema({
            query: this.queryNodeObjectTypeConverter.convertToGraphQLObjectType(queryType),
            mutation: this.queryNodeObjectTypeConverter.convertToGraphQLObjectType(mutationType)
        });
        return addOperationBasedResolvers(dumbSchema, op => {
            const rootType = op.operation.operation === 'mutation' ? mutationType : queryType;
            return this.resolveOperation(op, rootType);
        });
    }

    private async resolveOperation(operationInfo: OperationParams, rootType: QueryNodeObjectType) {
        globalContext.registerContext(this.context);
        let profileConsumer = this.context.profileConsumer;
        const logger = globalContext.loggerProvider.getLogger('query-resolvers');
        const watch = new Watch();
        const topLevelWatch = new Watch();
        const start = getPreciseTime();
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
                watch.stop('distillation');

                const requestRoles = this.getRequestRoles(operationInfo.context);
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
            let { canEvaluateStatically, result: data } = evaluateQueryStatically(queryTree);
            watch.stop('staticEvaluation');
            topLevelWatch.stop('preparation');
            if (!canEvaluateStatically) {
                const res = this.context.databaseAdapter.executeExt ?(await this.context.databaseAdapter.executeExt({
                    queryTree,
                    recordTimings: !!profileConsumer
                })) : {
                    data: this.context.databaseAdapter.execute(queryTree)
                };
                topLevelWatch.stop('database');
                dbAdapterTimings = res.timings;
                data = res.data;
                logger.debug(`Execution successful`);
            } else {
                logger.debug(`Execution successful (evaluated statically without database adapter))`);
            }
            if (logger.isTraceEnabled()) {
                logger.trace('Result: ' + JSON.stringify(data, undefined, '  '));
            }
            if (profileConsumer) {
                const preparation = {
                    ...(dbAdapterTimings ? dbAdapterTimings.preparation : {}),
                    ...watch.timings,
                    total: topLevelWatch.timings.preparation
                };
                const timings = {
                    database: dbAdapterTimings ? dbAdapterTimings.database : { total: watch.timings.database },
                    preparation,
                    total: getPreciseTime() - start
                };
                profileConsumer({
                    timings,
                    context: operationInfo.context,
                    operation: operationInfo.operation
                });
            }
            return data;
        } catch (e) {
            logger.error('Error evaluating GraphQL query: ' + e.stack);
            throw e;
        }
    }

    private getRequestRoles(context: any): string[] {
        if (context.authRoles == undefined) {
            return [];
        }
        if (!Array.isArray(context.authRoles)) {
            throw new Error(`Expected authRoles property in schema context to be an array, but is ${typeof context.authRoles}`);
        }
        return context.authRoles;
    }

}
