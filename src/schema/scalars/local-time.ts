import { GraphQLScalarType } from 'graphql';
import moment = require('moment');

function isValidLocalTime(value: any) {
    return moment(value, 'HH:mm:ss', true).isValid();
}

function coerceLocalTime(value: any): string {
    if (!isValidLocalTime(value)) {
        throw new TypeError(`Invalid ISO 8601 LocalTime: ${value}`);
    }
    return value;
}

export const GraphQLLocalTime = new GraphQLScalarType({
    name: 'LocalTime',
    description: 'The `LocalTime` scalar type represents a time without time zone in a format specified by ISO 8601, such as 10:15:30.\n\nLeap seconds are currently not supported.',
    serialize: coerceLocalTime,
    parseValue: coerceLocalTime,
    parseLiteral(ast) {
        if (ast.kind === 'StringValue') {
            const value = ast.value;
            if (isValidLocalTime(value)) {
                return value;
            }
            throw new TypeError(`Invalid ISO 8601 LocalTime: ${value}`);
        }
        throw new TypeError('LocalTime must be specified as String value');
    }
});
