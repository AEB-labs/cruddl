import { GraphQLError, GraphQLScalarType, Kind, print, ValueNode } from 'graphql';
import { inspect } from 'util';

function createFixedPointDecimalType(decimals: number) {
    const typeName = `Decimal${decimals}`;
    // this allows for up to 8192 rounding errors (that could occur when summing up values) with decimals <= 3
    const maxValue = 1_000_000_000;
    const minValue = -1_000_000_000;
    const minValueStr = minValue.toFixed(decimals);
    const maxValueStr = maxValue.toFixed(decimals);

    function coerceFixedPointDecimal(value: unknown) {
        // same logic like Float
        if (typeof value !== 'number' || !isFinite(value)) {
            throw new GraphQLError(`${typeName} cannot represent non numeric value: `.concat(inspect(value)));
        }

        const num = Number(value.toFixed(decimals));
        if (num > maxValue) {
            throw new GraphQLError(
                `${typeName} cannot represent value larger than ${maxValueStr}: `.concat(inspect(value))
            );
        }
        if (num < minValue) {
            throw new GraphQLError(
                `${typeName} cannot represent value smaller than ${minValueStr}: `.concat(inspect(value))
            );
        }

        return num;
    }

    function parseFixedPointDecimal(valueNode: ValueNode) {
        if (valueNode.kind !== 'IntValue' && valueNode.kind !== 'FloatValue') {
            throw new GraphQLError(
                `${typeName} cannot represent non numeric value: `.concat(print(valueNode)),
                valueNode
            );
        }

        const value = parseFloat(valueNode.value);
        const num = Number(value.toFixed(decimals));
        if (num > maxValue) {
            throw new GraphQLError(
                `${typeName} cannot represent value larger than ${maxValueStr}: `.concat(inspect(value))
            );
        }
        if (num < minValue) {
            throw new GraphQLError(
                `${typeName} cannot represent value smaller than ${minValueStr}: `.concat(inspect(value))
            );
        }

        return num;
    }

    const digitWord = decimals === 1 ? 'digit' : 'digits';
    return new GraphQLScalarType({
        name: `Decimal${decimals}`,
        description: `The ${typeName} scalar type represents signed numeric values with up to ${decimals} decimal ${digitWord}. ${typeName} can represent values between ${minValueStr} and ${maxValueStr}.

    Values of this type are serialized as numbers in GraphQL and JSON representations. The value is always rounded to ${decimals} decimal ${digitWord}.`,
        serialize: coerceFixedPointDecimal,
        parseValue: coerceFixedPointDecimal,
        parseLiteral: parseFixedPointDecimal
    });
}

export const GraphQLDecimal1 = createFixedPointDecimalType(1);
export const GraphQLDecimal2 = createFixedPointDecimalType(2);
export const GraphQLDecimal3 = createFixedPointDecimalType(3);
