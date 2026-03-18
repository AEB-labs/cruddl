import { GraphQLScalarType, type GraphQLScalarTypeConfig } from 'graphql';
import { parseObject } from './utils/parse-json.js';

const GraphQLJSONObjectConfig = {
    name: 'JSONObject',
    description:
        'The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).',
    serialize: ensureObject,
    parseValue: ensureObject,
    parseLiteral: parseObject,
} as GraphQLScalarTypeConfig<object, object>;

export const GraphQLJSONObject = new GraphQLScalarType(GraphQLJSONObjectConfig);

function ensureObject(value: any): object {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`JSONObject cannot represent non-object value: ${value}`);
    }

    return value;
}
