import { GraphQLScalarType } from 'graphql';
import moment = require('moment');

function isValidLocalDate(value: any) {
    return moment(value, 'YYYY-MM-DD', true).isValid();
}

function coerceLocalDate(value: any): string {
    if (!isValidLocalDate(value)) {
        throw new TypeError(`Invalid ISO 8601 LocalDate: ${value}`);
    }
    return value;
}

export const GraphQLLocalDate = new GraphQLScalarType({
    name: 'LocalDate',
    description: 'The `LocalDate` scalar type represents a date without time zone in a format specified by ISO 8601, such as 2007-12-03.',
    serialize: coerceLocalDate,
    parseValue: coerceLocalDate,
    parseLiteral(ast) {
        if (ast.kind === 'StringValue') {
            const value = ast.value;
            if (isValidLocalDate(value)) {
                return value;
            }
            throw new TypeError(`Invalid ISO 8601 LocalDate: ${value}`);
        }
        throw new TypeError('LocalDate must be specified as String value');
    }
});
