import { GraphQLFieldResolver } from 'graphql';
import { extractRuntimeError, isRuntimeErrorValue } from '../../query-tree';

/**
 * A GraphQL field resolver for the query node object type framework
 *
 * Resolves fields by alias
 *
 * If the value is a runtime error, throws. Otherwise, just returns the value.
 */
export const fieldResolver: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
    const fieldNode = info.fieldNodes[0];
    const alias = fieldNode.alias ? fieldNode.alias.value : fieldNode.name.value;
    const value = source[alias];

    if (isRuntimeErrorValue(value)) {
        throw extractRuntimeError(value);
    }
    return value;
};
