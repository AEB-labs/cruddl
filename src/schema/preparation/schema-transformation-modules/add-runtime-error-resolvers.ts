import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { transformSchema } from 'graphql-transformer';
import { extractRuntimeError, isRuntimeErrorValue } from '../../../query-tree';
import { isPromise } from '../../../utils/utils';
import { SchemaTransformationContext, SchemaTransformer } from '../transformation-pipeline';

export class AddRuntimeErrorResolversTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema, context: SchemaTransformationContext): GraphQLSchema {
        function maybeThrow(result: any) {
            if (isRuntimeErrorValue(result)) {
                throw extractRuntimeError(result);
            }
            return result;
        }

        return transformSchema(schema, {
            transformField(config) {
                return {
                    ...config,
                    resolve(source, args, context, info) {
                        const result = (config.resolve || defaultFieldResolver)(source, args, context, info);
                        if (isPromise(result)) {
                            return result.then(maybeThrow);
                        }
                        return maybeThrow(result);
                    }
                }
            }
        });
    }
}
