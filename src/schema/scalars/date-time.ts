import { GraphQLScalarType } from 'graphql';
import moment = require('moment');

function isValidDateTime(value: any) {
    return moment(value, moment.ISO_8601, true).isValid();
}

function coerceDateTime(value: any): string {
    if (!isValidDateTime(value)) {
        throw new TypeError(`Invalid ISO 8601 DateTime: ${value}`);
    }
    return value;
}

export const GraphQLDateTime = new GraphQLScalarType({
    name: 'DateTime',
    description:
    'The `DateTime` scalar type represents a point in time with an optional timezone specifier, in a format specified by ISO 8601.\n\nThe time part can currently be omitted, but this may change in tue future.',
    serialize: coerceDateTime,
    parseValue: coerceDateTime,
    parseLiteral(ast) {
        if (ast.kind === 'StringValue') {
            const value = ast.value;
            if (isValidDateTime(value)) {
                return value;
            }
            throw new TypeError(`Invalid ISO 8601 DateTime: ${value}`);
        }
        throw new TypeError('DateTime must be specified as String value');
    }
});
