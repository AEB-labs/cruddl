import { GraphQLFieldResolver } from 'graphql';
import { ExecutionOptions } from '../../execution/execution-options';
import { extractRuntimeError, isRuntimeErrorValue } from '../../query-tree';
import { SchemaTransformationContext } from '../../schema/preparation/transformation-pipeline';

/**
 * A GraphQL field resolver for the query node object type framework
 *
 * Resolves fields by alias
 *
 * If the value is a runtime error, throws. Otherwise, just returns the value.
 */
export function getFieldResolver(
    schemaTransformationContext: SchemaTransformationContext,
    transformResult?: (data: any, args: object, executionOptions: ExecutionOptions) => any,
): GraphQLFieldResolver<any, any> {
    return (source, args, context, info) => {
        const fieldNode = info.fieldNodes[0];
        const alias = fieldNode.alias ? fieldNode.alias.value : fieldNode.name.value;
        let value = source[alias];

        if (transformResult) {
            const executionOptions =
                schemaTransformationContext.getExecutionOptions?.({
                    context,
                    operationDefinition: info.operation,
                }) ?? {};

            value = transformResult(value, args, executionOptions);
        }

        if (isRuntimeErrorValue(value)) {
            throw extractRuntimeError(value);
        }

        return value;
    };
}
