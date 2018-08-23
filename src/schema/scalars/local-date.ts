import { GraphQLScalarType } from 'graphql';
import { LocalDate } from 'js-joda';

function parseLocalDate(value: any): LocalDate {
    if (typeof value !== 'string') {
        throw new Error(`should be a string`);
    }
    try {
        return LocalDate.parse(value);
    } catch (e) {
        if (e.name === 'DateTimeParseException') {
            throw new Error(`Invalid ISO 8601 LocalDate: ${value}`)
        }
        throw e;
    }
}

function coerceLocalDate(value: string): string {
    return parseLocalDate(value).toString();
}

export const GraphQLLocalDate = new GraphQLScalarType({
    name: 'LocalDate',
    description: 'The `LocalDate` scalar type represents a date without time zone in a format specified by ISO 8601, such as 2007-12-03.',
    serialize: coerceLocalDate,
    parseValue: coerceLocalDate,
    parseLiteral(ast) {
        if (ast.kind !== 'StringValue') {
            throw new Error('LocalDate must be specified as String value');
        }
        return coerceLocalDate(ast.value);
    }
});
