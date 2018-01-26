import { GraphQLScalarType, GraphQLSchema } from 'graphql';
import { GraphQLDateTime } from '../../scalars/date-time';
import { transformSchema } from 'graphql-transformer/dist';
import { arrayToObject } from '../../../utils/utils';
import { SchemaTransformer } from '../transformation-pipeline';
import GraphQLJSON = require('graphql-type-json');

const scalars: GraphQLScalarType[] = [
    GraphQLDateTime,
    GraphQLJSON
];
const scalarMap = arrayToObject(scalars, scalar => scalar.name);

export class ImplementScalarTypesTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema) {
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
        });
    }
}
