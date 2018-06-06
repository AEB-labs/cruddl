import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { transformSchema } from 'graphql-transformer';
import { extractRuntimeError, isRuntimeErrorValue } from '../../../query-tree';
import { isPromise } from '../../../utils/utils';
import { SchemaTransformer } from '../transformation-pipeline';

export class AddRuntimeErrorResolversTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema): GraphQLSchema {
        return transformSchema(schema, {
            transformField(config) {
                return {
                    ...config,
                    resolve(source, args, context, info) {
                        const result = (config.resolve || defaultFieldResolver)(source, args, context, info);
                        if (isPromise(result)) {
                            return result.then(res => {
                                if (isRuntimeErrorValue(res)) {
                                    throw extractRuntimeError(res);
                                }
                                return res;
                            })
                        }
                        if (isRuntimeErrorValue(result)) {
                            throw extractRuntimeError(result);
                        }
                        return result;
                    }
                }
            }
        });
    }
}
