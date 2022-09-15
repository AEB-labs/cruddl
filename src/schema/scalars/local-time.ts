import { GraphQLScalarType } from 'graphql';
import { LocalTime } from '@js-joda/core';

function parseLocalTime(value: unknown): LocalTime {
    if (typeof value !== 'string') {
        throw new Error(`should be a string`);
    }
    try {
        return LocalTime.parse(value);
    } catch (e: any) {
        if (e.name === 'DateTimeParseException') {
            throw new Error(`Invalid ISO 8601 LocalTime: ${value}`);
        }
        throw e;
    }
}

function coerceLocalTime(value: unknown): string {
    return parseLocalTime(value).toString();
}

export const GraphQLLocalTime = new GraphQLScalarType({
    name: 'LocalTime',
    description:
        'The `LocalTime` scalar type represents a time without time zone in a format specified by ISO 8601, such as 10:15:30 or 17:05:03.521.\n\nThe valid range is between 00:00:00 and 23:59:59.999999999. 24:00 is not allowed to avoid bugs in clients that treat 24:00 as 0:00.\n\nThe seconds part is cut off if it is zero, e.g. 12:34:00 is converted to 12:34. Second fraction digits are cut off at the nearest three-digit group, e.g. 00:00:00.1234 is converted to 00:00:00.123400.\n\nLeap seconds can not be specified.',
    serialize: coerceLocalTime,
    parseValue: coerceLocalTime,
    parseLiteral(ast) {
        if (ast.kind !== 'StringValue') {
            throw new Error('LocalTime must be specified as String value');
        }
        return coerceLocalTime(ast.value);
    },
});
