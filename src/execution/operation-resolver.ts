import { print } from 'graphql';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { globalContext } from '../config/global';
import { RequestProfile } from '../config/interfaces';
import {
    DatabaseAdapter,
    ExecutionPlan,
    FlexSearchTokenizable,
    TransactionStats,
} from '../database/database-adapter';
import { OperationParams } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import {
    BinaryOperator,
    ObjectQueryNode,
    PreExecQueryParms,
    PropertySpecification,
    QueryNode,
    WithPreExecutionQueryNode,
} from '../query-tree';
import {
    FlexSearchComplexOperatorQueryNode,
    FlexSearchQueryNode,
    FlexSearchTokenization,
} from '../query-tree/flex-search';
import { evaluateQueryStatically } from '../query-tree/utils';
import {
    FieldContext,
    QueryNodeObjectType,
    SelectionToken,
    buildConditionalObjectQueryNode,
} from '../schema-generation/query-node-object-type';
import { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline';
import { Watch, getPreciseTime } from '../utils/watch';
import { DefaultClock, ExecutionOptions, UUIDGenerator } from './execution-options';
import { ExecutionResult } from './execution-result';

export class OperationResolver {
    constructor(private context: SchemaTransformationContext) {}

    async resolveOperation(
        operationInfo: OperationParams,
        rootType: QueryNodeObjectType,
        options?: ExecutionOptions,
    ): Promise<ExecutionResult> {
        globalContext.registerContext(this.context);
        let profileConsumer = this.context.profileConsumer;
        const logger = globalContext.loggerProvider.getLogger('query-resolvers');

        if (!options) {
            options = this.context.getExecutionOptions
                ? this.context.getExecutionOptions({
                      context: operationInfo.context,
                      operationDefinition: operationInfo.operation,
                  })
                : {};
        }

        const needsTimings = profileConsumer || options.recordPlan || options.recordTimings;
        const watch = needsTimings ? new Watch() : undefined;
        const topLevelWatch = needsTimings ? new Watch() : undefined;

        const operationDesc = `${operationInfo.operation.operation} ${
            operationInfo.operation.name ? operationInfo.operation.name.value : ''
        }`;
        const start = needsTimings ? getPreciseTime() : undefined;
        if (
            operationInfo.operation.operation === 'mutation' &&
            options.mutationMode === 'disallowed'
        ) {
            throw new Error(`Mutations are not allowed`);
        }

        let queryTree: QueryNode;
        try {
            logger.debug(
                `Executing ${operationDesc} with roles ${
                    options.authContext?.authRoles || [].join(', ')
                }`,
            );
            if (logger.isTraceEnabled()) {
                logger.trace(`Operation: ${print(operationInfo.operation)}`);
            }
            const operation = distillOperation({
                ...operationInfo,
                includeTypenameFields: options?.handleTypenameFields,
            });
            if (logger.isTraceEnabled()) {
                logger.trace(`DistilledOperation: ${operation.describe()}`);
            }
            if (watch) {
                watch.stop('distillation');
            }

            const rootQueryNode = ObjectQueryNode.EMPTY; // can't use NULL because then the whole operation would yield null
            const fieldContext: FieldContext = {
                selectionStack: [],
                selectionTokenStack: [],
                selectionToken: new SelectionToken(),
                flexSearchMaxFilterableAmountOverride:
                    options.flexSearchMaxFilterableAndSortableAmount,
                flexSearchRecursionDepth: options.flexSearchRecursionDepth,
                childEntityUpdatesViaDictStrategyThreshold:
                    options.childEntityUpdatesViaDictStrategyThreshold,
                clock: options.clock ?? new DefaultClock(),
                idGenerator: options.idGenerator ?? new UUIDGenerator(),
                implicitLimitForRootEntityQueries: options.implicitLimitForRootEntityQueries,
                maxLimitForRootEntityQueries: options.maxLimitForRootEntityQueries,
            };
            queryTree = buildConditionalObjectQueryNode(
                rootQueryNode,
                rootType,
                operation.selectionSet,
                fieldContext,
            );
            if (logger.isTraceEnabled()) {
                logger.trace('Before expansion: ' + queryTree.describe());
            }
            const tokens: ReadonlyArray<FlexSearchTokenization> = await this.queryFlexSearchTokens(
                queryTree,
                this.context.databaseAdapter,
            );
            queryTree = this.expandQueryNode(queryTree, tokens).node;
            if (logger.isTraceEnabled()) {
                logger.trace('Before authorization: ' + queryTree.describe());
            }
            if (watch) {
                watch.stop('queryTree');
            }
            if (!options.disableAuthorization) {
                queryTree = applyAuthorizationToQueryTree(queryTree, options.authContext ?? {});
                if (logger.isTraceEnabled()) {
                    logger.trace('After authorization: ' + queryTree.describe());
                }
                if (watch) {
                    watch.stop('authorization');
                }
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
            const res = this.context.databaseAdapter.executeExt
                ? await this.context.databaseAdapter.executeExt({
                      queryTree,
                      ...options,
                  })
                : {
                      data: this.context.databaseAdapter.execute(queryTree),
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
            logger.debug(
                `Executed ${operationDesc} (evaluated statically without database adapter))`,
            );
        }
        if (logger.isTraceEnabled()) {
            logger.trace('Result: ' + JSON.stringify(data, undefined, '  '));
        }
        let profile: RequestProfile | undefined;
        if (watch && topLevelWatch && start != undefined) {
            // equivalent to (profileConsumer || options.recordPlan || options.recordTimings) but pleases typescript
            const preparation = {
                ...(dbAdapterTimings ? dbAdapterTimings.preparation : {}),
                ...watch.timings,
                total: topLevelWatch.timings.preparation,
            };
            const timings = {
                database: dbAdapterTimings
                    ? dbAdapterTimings.database
                    : { total: watch.timings.database },
                dbConnection: dbAdapterTimings ? dbAdapterTimings.dbConnection : { total: 0 },
                preparation,
                total: getPreciseTime() - start,
            };
            profile = {
                timings,
                plan,
                stats,
                context: operationInfo.context,
                operation: operationInfo.operation,
                variableValues: operationInfo.variableValues,
                fragments: operationInfo.fragments,
                schema: operationInfo.schema,
            };
        }
        return {
            data,
            error,
            profile,
        };
    }

    private async queryFlexSearchTokens(
        queryTree: QueryNode,
        databaseAdapter: DatabaseAdapter,
    ): Promise<ReadonlyArray<FlexSearchTokenization>> {
        function collectTokenizations(queryNode: QueryNode): ReadonlyArray<FlexSearchTokenizable> {
            let tokens: FlexSearchTokenizable[] = [];
            if (queryNode instanceof FlexSearchComplexOperatorQueryNode) {
                tokens.push({ expression: queryNode.expression, analyzer: queryNode.analyzer });
            }
            if (queryNode instanceof ObjectQueryNode) {
                const specs: PropertySpecification[] = [];
                for (const property of queryNode.properties) {
                    tokens = tokens.concat(collectTokenizations(property.valueNode));
                }
            }

            for (const field of Object.keys(queryNode)) {
                const childNode = (queryNode as any)[field];
                if (childNode instanceof QueryNode) {
                    tokens = tokens.concat(collectTokenizations(childNode));
                }
            }
            return tokens;
        }

        const tokenizations = collectTokenizations(queryTree);
        if (!tokenizations.length) {
            return [];
        }
        return databaseAdapter.tokenizeExpressions(tokenizations);
    }

    private expandQueryNode(
        queryNode: QueryNode,
        tokenizations: ReadonlyArray<FlexSearchTokenization>,
    ): { node: QueryNode; containsComplexOR: boolean } {
        if (queryNode instanceof FlexSearchComplexOperatorQueryNode) {
            return {
                node: queryNode.expand(tokenizations),
                containsComplexOR: queryNode.logicalOperator === BinaryOperator.OR,
            };
        }

        if (queryNode instanceof FlexSearchQueryNode) {
            const expandedFilter = this.expandQueryNode(queryNode.flexFilterNode, tokenizations);
            return {
                node: new FlexSearchQueryNode({
                    rootEntityType: queryNode.rootEntityType,
                    itemVariable: queryNode.itemVariable,
                    flexFilterNode: expandedFilter.node,
                    isOptimisationsDisabled: expandedFilter.containsComplexOR,
                }),
                containsComplexOR: expandedFilter.containsComplexOR,
            };
        }

        if (queryNode instanceof ObjectQueryNode) {
            const specs: PropertySpecification[] = [];
            let containsComplexOR = false;
            for (const property of queryNode.properties) {
                const expandedValue = this.expandQueryNode(property.valueNode, tokenizations);
                specs.push(new PropertySpecification(property.propertyName, expandedValue.node));
                if (expandedValue.containsComplexOR) {
                    containsComplexOR = true;
                }
            }
            return {
                node: new ObjectQueryNode(specs),
                containsComplexOR: containsComplexOR,
            };
        }

        if (queryNode instanceof WithPreExecutionQueryNode) {
            const newParms: PreExecQueryParms[] = [];
            let containsComplexOR = false;
            for (const preExecQueryParms of queryNode.preExecQueries) {
                const expandedValue = this.expandQueryNode(preExecQueryParms.query, tokenizations);
                newParms.push(
                    new PreExecQueryParms({
                        query: expandedValue.node,
                        resultValidator: preExecQueryParms.resultValidator,
                        resultVariable: preExecQueryParms.resultVariable,
                    }),
                );
                if (expandedValue.containsComplexOR) {
                    containsComplexOR = true;
                }
            }
            let expandedResultNode = this.expandQueryNode(queryNode.resultNode, tokenizations);
            if (expandedResultNode.containsComplexOR) {
                containsComplexOR = true;
            }
            return {
                node: new WithPreExecutionQueryNode({
                    resultNode: expandedResultNode.node,
                    preExecQueries: newParms,
                }),
                containsComplexOR,
            };
        }

        const newFieldValues: { [name: string]: QueryNode } = {};
        let hasChanged = false;
        let containsComplexOR = false;
        for (const field of Object.keys(queryNode)) {
            const oldValue = (queryNode as any)[field];
            if (oldValue instanceof QueryNode) {
                const newValue = this.expandQueryNode(oldValue, tokenizations);
                if (newValue.containsComplexOR) {
                    containsComplexOR = true;
                }
                if (newValue.node != oldValue) {
                    newFieldValues[field] = newValue.node;
                    hasChanged = true;
                }
            }
        }
        if (!hasChanged) {
            return {
                node: queryNode,
                containsComplexOR: false,
            };
        }
        const newObj = Object.create(Object.getPrototypeOf(queryNode));
        Object.assign(newObj, queryNode, newFieldValues);
        return {
            node: newObj,
            containsComplexOR: containsComplexOR,
        };
    }
}
