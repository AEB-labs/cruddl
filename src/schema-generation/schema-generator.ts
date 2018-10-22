import { GraphQLSchema, print } from 'graphql';
import { applyAuthorizationToQueryTree } from '../authorization/execution';
import { globalContext } from '../config/global';
import { addOperationBasedResolvers, OperationParams } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { Model } from '../model';
import { ObjectQueryNode, QueryNode } from '../query-tree';
import { evaluateQueryStatically } from '../query-tree/utils';
import { SchemaTransformationContext } from '../schema/preparation/transformation-pipeline';
import {
    buildConditionalObjectQueryNode, QueryNodeObjectType, QueryNodeObjectTypeConverter
} from './query-node-object-type';
import { RootTypesGenerator } from './root-types-generator';


export function time() {
    const hrTime = process.hrtime();
    return hrTime[0] + hrTime[1] / 1000000000;
}

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
        const logger = globalContext.loggerProvider.getLogger('query-resolvers');
        try {
            const start = time();
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

                const requestRoles = this.getRequestRoles(operationInfo.context);
                logger.debug(`Request roles: ${requestRoles.join(', ')}`);
                const rootQueryNode = ObjectQueryNode.EMPTY; // can't use NULL because then the whole operation would yield null
                queryTree = buildConditionalObjectQueryNode(rootQueryNode, rootType, operation.selectionSet);
                if (logger.isTraceEnabled()) {
                    logger.trace('Before authorization: ' + queryTree.describe());
                }
                queryTree = applyAuthorizationToQueryTree(queryTree, {authRoles: requestRoles});
                if (logger.isTraceEnabled()) {
                    logger.trace('After authorization: ' + queryTree.describe());
                }
            } finally {
                globalContext.unregisterContext();
            }
            let {canEvaluateStatically, result} = evaluateQueryStatically(queryTree);
            const end = time();
            if (!canEvaluateStatically) {
                result = await this.context.databaseAdapter.execute(queryTree);
                logger.debug(`Execution successful`);
            } else {
                logger.debug(`Execution successful (evaluated statically without database adapter))`);
            }
            logger.info(`duration: ${end - start} s`);
            if (logger.isTraceEnabled()) {
                logger.trace('Result: ' + JSON.stringify(result, undefined, '  '));
            }
            return result;
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
