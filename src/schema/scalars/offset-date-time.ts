import { GraphQLScalarType } from 'graphql';
import {
    DateTimeFormatter,
    DateTimeFormatterBuilder,
    Instant,
    LocalDateTime,
    ResolverStyle,
    ZonedDateTime,
    ZoneOffset,
} from '@js-joda/core';

/**
 * The representation of an OffsetDateTime in the database
 */
export interface StoredOffsetDateTime {
    readonly timestamp: string;
    readonly offset: string;
}

export const TIMESTAMP_PROPERTY: 'timestamp' = 'timestamp';
export const OFFSET_PROPERTY: 'offset' = 'offset';

export const GraphQLOffsetDateTime = new GraphQLScalarType({
    name: 'OffsetDateTime',
    description:
        'The `OffsetDateTime` scalar type represents a point in time with a timezone offset, in a format specified by ISO 8601, such as `2007-12-03T10:15:30+01:00` or `2007-12-03T10:15:30.123Z`.\n\nOnly use this type for timestamps that are inherently tied to a location and the timezone offset should be calculated eagerly. To only store a point in time, use `DateTime`.\n\nThe *second* part is added if not specified, e.g. `2007-12-03T12:34Z` is converted to `2007-12-03T12:34:00Z`. Offset specifier `Z` is accepted but will be converted to `+00:00`. Leap seconds are not supported.',
    serialize: printOffsetDateTime,
    parseValue: parseOffsetDateTime,
    parseLiteral(ast) {
        if (ast.kind !== 'StringValue') {
            throw new Error('OffsetDateTime must be specified as String value');
        }
        return parseOffsetDateTime(ast.value);
    },
});

export function serializeForStorage(value: ZonedDateTime): StoredOffsetDateTime {
    const offset = (value.offset() as ZoneOffset).toString();
    return {
        // use the constants here so typescript complains if the interface and constants are inconsistent
        [TIMESTAMP_PROPERTY]: value.toInstant().toString(),
        [OFFSET_PROPERTY]: offset === 'Z' ? '+00:00' : offset,
    };
}

const formatter = new DateTimeFormatterBuilder()
    .parseCaseInsensitive()
    .append(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
    .appendOffset('+HH:MM', '+00:00')
    .toFormatter(ResolverStyle.STRICT);

function parseOffsetDateTime(value: string): ZonedDateTime {
    if (typeof value !== 'string') {
        throw new Error(`should be a string`);
    }
    let zonedDateTime: ZonedDateTime;
    try {
        zonedDateTime = ZonedDateTime.parse(value);
    } catch (e: any) {
        if (e.name === 'DateTimeParseException') {
            // see if no offset is specified for a better error message
            if (tryParseLocalDateTime(value) !== undefined) {
                throw new Error(`OffsetDateTime is missing timezone offset: ${value}`);
            }

            throw new Error(`Invalid ISO 8601 OffsetDateTime: ${value}`);
        }
        throw e;
    }
    if (!(zonedDateTime.zone() instanceof ZoneOffset)) {
        // don't allow to specify a zone - we wouldn't do anything with it anyway
        // also, specifying a zone is a bit weird - it converts the given offset-date-time to the specified zone
        throw new Error(`Invalid ISO 8601 OffsetDateTime: ${value}`);
    }
    return zonedDateTime.withFixedOffsetZone();
}

function buildFromStoredValue(value: StoredOffsetDateTime) {
    return ZonedDateTime.ofInstant(Instant.parse(value.timestamp), ZoneOffset.of(value.offset));
}

function printOffsetDateTime(value: ZonedDateTime | StoredOffsetDateTime) {
    if (!(value instanceof ZonedDateTime)) {
        value = buildFromStoredValue(value);
    }

    return value.format(formatter);
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
