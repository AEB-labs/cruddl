import { GraphQLScalarType, type GraphQLScalarTypeConfig } from 'graphql';
import { parseLiteral } from './utils/parse-json.js';

const GraphQLJSONConfig = {
    name: 'JSON',
    description:
        'The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).',
    serialize: identity,
    parseValue: identity,
    parseLiteral,
} as GraphQLScalarTypeConfig<any, any>;

export const GraphQLJSON = new GraphQLScalarType(GraphQLJSONConfig);

function identity<T>(value: T): T {
    return value;
}
