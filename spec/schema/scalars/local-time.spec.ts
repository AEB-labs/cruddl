import { expect } from 'chai';
import { GraphQLLocalTime } from '../../../src/schema/scalars/local-time';

describe('GraphQLLocalTime', () => {
    const validStrings = [
        '14:50',
        '14:50:12',
        '14:50:12.123',
        '14:50:12.123456',
        '14:50:12.123456789',
    ];

    const invalidStrings = [
        'something',
        // disputed, but eventually settled that the java 8 spec guys probably hat a reason to not all this in LocalTime
        // con: does not allow something like Mondays 18:00 - 24:00
        // pro: avoids bugs where 24:00 is parsed as 0:00 and one forgets to increment the corresponding date (18:00 - 0:00) - minus six hours?
        '24:00:00',

        '2018-08-21',
        '14:50:00Z',
        '14:50:00+01:00',
        '2018-08-21T14:50:00Z',
        '2018-08-21T14:50:00',
        '2018-08-21T14:50:00+04:00',
        '2018-08-21T14:50:00+04:00[Europe/Berlin]',
        '2018-08-21T14:50:00[Europe/Berlin]',
        '2018-08-21+04:00',
        '2018-08-21T+04:00',
        '24:00:01',
        '23:59:60', // leap seconds are not supported here
        '14:50:00.1234567890', // too many fraction digits
    ];

    // these coercions are important to have canonical representations of all values so that search and equality works properly
    const coercedStrings = [
        // seconds are omitted if zero. Alternative would be to add them if not specified
        // this works good for the common use case of a simple hour/minute select control
        // the usage of seconds hints at that LocalTime is not the right type and a DateTime should be used instead
        ['14:50:00', '14:50'],
        ['14:50:12.1', '14:50:12.100'],
        ['14:50:12.12', '14:50:12.120'],
        ['14:50:12.000', '14:50:12'],
        ['14:50:12.1234', '14:50:12.123400'],
        ['14:50:12.12345', '14:50:12.123450'],
        ['14:50:12.123000', '14:50:12.123'],
        ['14:50:12.1234567', '14:50:12.123456700'],
        ['14:50:12.12345678', '14:50:12.123456780'],
    ];

    for (const str of validStrings) {
        it(`accepts ${str}`, () => {
            expect(GraphQLLocalTime.parseValue(str)).to.equal(str);
        });
    }

    for (const str of invalidStrings) {
        it(`rejects ${str}`, () => {
            expect(() => GraphQLLocalTime.parseValue(str)).to.throw(
                `Invalid ISO 8601 LocalTime: ${str}`,
            );
        });
    }

    for (const [input, result] of coercedStrings) {
        it(`coerces ${input} to ${result}`, () => {
            expect(GraphQLLocalTime.parseValue(input)).to.equal(result);
        });
    }
});
