import { GraphQLSchema } from 'graphql';
import { GraphQLDateTime } from '../../scalars/date-time';
import { SchemaTransformationContext, transformSchema } from 'graphql-transformer/dist';
import { arrayToObject, mapValues } from '../../../utils/utils';
import { SchemaTransformer } from '../transformation-pipeline';

const scalars = [ GraphQLDateTime ];
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
