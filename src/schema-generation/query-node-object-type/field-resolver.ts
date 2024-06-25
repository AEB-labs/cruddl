import { GraphQLFieldResolver } from 'graphql';
import { extractRuntimeError, isRuntimeErrorValue } from '../../query-tree';

/**
 * A GraphQL field resolver for the query node object type framework
 *
 * Resolves fields by alias
 *
 * If the value is a runtime error, throws. Otherwise, just returns the value.
 */
export function getFieldResolver(
    transformResult?: (data: any, args: object) => any,
): GraphQLFieldResolver<any, any> {
    return (source, args, context, info) => {
        const fieldNode = info.fieldNodes[0];
        const alias = fieldNode.alias ? fieldNode.alias.value : fieldNode.name.value;
        let value = source[alias];

        if (transformResult) {
            value = transformResult(value, args);
        }

        if (isRuntimeErrorValue(value)) {
            throw extractRuntimeError(value);
        }

        return value;
    };
}
