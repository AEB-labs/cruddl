import {defaultFieldResolver, GraphQLError, GraphQLSchema, OperationDefinitionNode, print, ResponsePath} from 'graphql';
import {DatabaseAdapter} from '../database/database-adapter';
import {addOperationBasedResolvers} from '../graphql/operation-based-resolvers';
import {distillOperation} from '../graphql/query-distiller';
import {createQueryTree} from './query-tree-builder';
import {addAliasBasedResolvers} from '../graphql/alias-based-resolvers';
import {AuthorizationCheckResult, checkAuthorization} from './authorization-inspector';
import {transformSchema} from 'graphql-transformer/dist';
import {globalContext} from "../config/global";

export function addQueryResolvers(schema: GraphQLSchema, databaseAdapter: DatabaseAdapter) {
    // this is needed because the query tree already does the alias handling and stores the values in the places where
    // the user expects it - GraphQL should not mess with this by using the *field* instead of the alias in the resolvers
    // do this first because addOperationBasedResolvers supports resolver chaining and this one does not (how would it)
    schema = addAliasBasedResolvers(schema);

    const authorizationCheckResultsByOperation = new WeakMap<OperationDefinitionNode, AuthorizationCheckResult>();

    // this needs to be first (deeper/later in the chain) because authorizationCheckResultsByOperation needs to be filled already
    schema = transformSchema(schema, {
        transformField(config) {
            return {
                ...config,
                resolve(source, args, context, info) {
                    const result = authorizationCheckResultsByOperation.get(info.operation);
                    if (result) {
                        const errors = result.errors.filter(error => comparePath(info.path, error.path));
                        if (errors.length) {
                            throw new GraphQLError(errors.join(', '));
                        }
                    }
                    return (config.resolve || defaultFieldResolver)(source, args, context, info);
                }
            }
        }
    });

    schema = addOperationBasedResolvers(schema, async operationInfo => {
        try {
            const logger = globalContext.loggerProvider.getLogger('Momo QueryResolver');
            logger.debug(`Executing operation ${print(operationInfo.operation)}`);
            const operation = distillOperation(operationInfo);
            logger.debug(operation.describe());

            const requestRoles = getRequestRoles(operationInfo.context);
            logger.debug(`Request roles: ${requestRoles.join(', ')}`);
            const authorizationCheckResult = checkAuthorization(operation, requestRoles);
            if (authorizationCheckResult.hasErrors) {
                logger.warn(`Authorization errors:\n${authorizationCheckResult.errors.join('\n')}`);
                logger.info(`Sanitized operation:\n${authorizationCheckResult.sanitizedOperation.describe()}`);
            } else {
                logger.debug('Authorization ok.');
            }
            authorizationCheckResultsByOperation.set(operationInfo.operation, authorizationCheckResult);

            const queryTree = createQueryTree(authorizationCheckResult.sanitizedOperation);
            logger.debug(queryTree.describe());
            const result = queryTree.properties.length ? await databaseAdapter.execute(queryTree) : {};
            logger.debug(JSON.stringify(result, undefined, '  '));
            return result;
        } catch (e) {
            console.error(e.stack);
            throw e;
        }
    });

    return schema;
}

function getRequestRoles(context: any): string[] {
    return context.authRoles || [];
}

function comparePath(path: ResponsePath, fieldPath: string[], index = 0): boolean {
    if (!path) {
        return fieldPath.length - index == 0;
    }
    if (fieldPath.length - index == 0) {
        return false; // path is longer than fieldPath
    }
    if (typeof path.key == 'number') {
        // don't care about array access
        return comparePath(path.prev, fieldPath, index);
    }
    if (path.key != fieldPath[fieldPath.length - 1 - index]) {
        return false;
    }
    return comparePath(path.prev, fieldPath, index + 1);
}
