import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { isPromise } from '../utils/utils';
import { transformSchema } from 'graphql-transformer/dist';

export const RUNTIME_ERROR_TOKEN = '__cruddl_runtime_error';

export interface RuntimeErrorValue {
    __cruddl_runtime_error: string
}

export function addRuntimeErrorResolvers(schema: GraphQLSchema) {
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

export function isRuntimeErrorValue(value: any): value is RuntimeErrorValue {
    return typeof value == 'object' && value !== null && RUNTIME_ERROR_TOKEN in value;
}

export function extractRuntimeError(value: RuntimeErrorValue): Error {
    return new Error(value.__cruddl_runtime_error);
}

export function createRuntimeErrorValue(message: string): RuntimeErrorValue {
    return {
        [RUNTIME_ERROR_TOKEN]: message
    };
}
