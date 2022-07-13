import { GraphQLScalarType } from 'graphql';
import { Instant, LocalDateTime, ZonedDateTime, ZoneOffset } from '@js-joda/core';

function parseDateTime(value: string): Instant {
    if (typeof value !== 'string') {
        throw new Error(`should be a string`);
    }
    try {
        return Instant.parse(value);
    } catch (e: any) {
        if (e.name === 'DateTimeParseException') {
            // allow +00:00 and the like (normalized() returns a ZoneOffsets for fixed zones
            const zonedDateTime = tryParseZonedDateTime(value);
            if (zonedDateTime) {
                if (zonedDateTime.zone().normalized().equals(ZoneOffset.UTC)) {
                    return zonedDateTime.toInstant();
                }
                throw new Error(`DateTime should be in UTC: ${value}`);
            }

            // see if no zone is specified for a better error message
            if (tryParseLocalDateTime(value) !== undefined) {
                throw new Error(`DateTime is missing timezone specifier (should be UTC): ${value}`);
            }

            throw new Error(`Invalid ISO 8601 DateTime: ${value}`);
        }
        throw e;
    }
}

function coerceDateTime(value: any): string {
    // if second fractions are
    return parseDateTime(value).toString();
}

function tryParseZonedDateTime(str: string): ZonedDateTime | undefined {
    try {
        return ZonedDateTime.parse(str);
    } catch (e: any) {
        if (e.name === 'DateTimeParseException') {
            return undefined;
        }
        throw e;
    }
}

function tryParseLocalDateTime(str: string): LocalDateTime | undefined {
    try {
        return LocalDateTime.parse(str);
    } catch (e: any) {
        if (e.name === 'DateTimeParseException') {
            return undefined;
        }
        throw e;
    }
}

export const GraphQLDateTime = new GraphQLScalarType({
    name: 'DateTime',
    description:
        'The `DateTime` scalar type represents a point in time in UTC, in a format specified by ISO 8601, such as `2007-12-03T10:15:30Z` or `2007-12-03T10:15:30.123Z`.\n\nThis scalar type rejects values without timezone specifier or with a timezone other than UTC. See also `LocalDate` and `LocalTime` for values without timezone specifier. To store Date/time values with timezones other than UTC, define a value object type with the fields you need.\n\nThe *second* part is added if not specified, e.g. `2007-12-03T12:34Z` is converted to `2007-12-03T12:34:00Z`. Second fraction digits are cut off at the nearest three-digit group, e.g. `2007-12-03T00:00:00.1234Z` is converted to `2007-12-03T00:00:00.123400Z`.\n\nValues with leap seconds are shifted back by one second, but this behavior should not be relied upon.',
    serialize: coerceDateTime,
    parseValue: coerceDateTime,
    parseLiteral(ast) {
        if (ast.kind !== 'StringValue') {
            throw new Error('DateTime must be specified as String value');
        }
        return coerceDateTime(ast.value);
    },
});
