import { GraphQLSchema } from 'graphql';
import { GraphQLDateTime } from './date-time';
import { transformSchema } from 'graphql-transformer/dist';
import { arrayToObject, mapValues } from '../../utils/utils';

const scalars = [ GraphQLDateTime ];
const scalarMap = arrayToObject(scalars, scalar => scalar.name);

/**
 * Adds implementation functions for the predefined scalar types
 */
export function implementScalarTypes(schema: GraphQLSchema): GraphQLSchema {
    return transformSchema(schema, {
        transformScalarType(config) {
            const scalar = scalarMap[config.name];
            if (scalar) {
                return {
                    ...scalar,
                    description: scalar.description,
                    serialize: scalar.serialize.bind(scalar),
                    parseLiteral: scalar.parseLiteral.bind(scalar),
                    parseValue: scalar.parseValue.bind(scalar)
                }
            }
            return config;
        }
    })
}
