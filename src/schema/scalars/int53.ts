import { GraphQLError, GraphQLScalarType, Kind, print, ValueNode } from 'graphql';

function coerceInt53(value: unknown) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new GraphQLError(
            `Int53 cannot represent non-integer value: ${JSON.stringify(value)}`,
        );
    }

    if (value > Number.MAX_SAFE_INTEGER) {
        throw new GraphQLError(
            `Int53 cannot represent value larger than ${Number.MAX_SAFE_INTEGER}: ${JSON.stringify(
                value,
            )}`,
        );
    }

    if (value < Number.MIN_SAFE_INTEGER) {
        throw new GraphQLError(
            `Int53 cannot represent value smaller than ${Number.MIN_SAFE_INTEGER}: ${JSON.stringify(
                value,
            )}`,
        );
    }

    return value;
}

function parseInt53(valueNode: ValueNode) {
    if (valueNode.kind !== Kind.INT) {
        throw new GraphQLError(
            `Int53 cannot represent non-integer value: ${print(valueNode)}`,
            valueNode,
        );
    }

    var num = parseInt(valueNode.value, 10);
    if (num > Number.MAX_SAFE_INTEGER) {
        throw new GraphQLError(
            `Int53 cannot represent value larger than ${Number.MAX_SAFE_INTEGER}: ${valueNode.value}`,
            valueNode,
        );
    }
    if (num < Number.MIN_SAFE_INTEGER) {
        throw new GraphQLError(
            `Int53 cannot represent value smaller than ${Number.MIN_SAFE_INTEGER}: ${valueNode.value}`,
            valueNode,
        );
    }

    return num;
}

export const GraphQLInt53 = new GraphQLScalarType({
    name: 'Int53',
    description: `The Int53 scalar type represents non-fractional signed whole numeric values. Int53 can represent values between -9007199254740991 and 9007199254740991.

Values of this type are serialized as numbers in GraphQL and JSON representations. The numeric range of this type corresponds to the safe integer range of an IEEE 754 double precision binary floating-point value.`,
    serialize: coerceInt53,
    parseValue: coerceInt53,
    parseLiteral: parseInt53,
});
