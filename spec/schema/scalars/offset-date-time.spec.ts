import { expect } from 'chai';
import {
    GraphQLOffsetDateTime,
    serializeForStorage,
} from '../../../src/schema/scalars/offset-date-time';

describe('GraphQLOffsetDateTime', () => {
    const validStrings = [
        '2018-08-21T14:50:00+00:00',
        '2018-08-21T14:50:15+00:00',
        '2004-02-29T14:50:00+00:00', // leap year
        '2018-08-21T14:50:00.123+05:00',
        '2018-08-21T14:50:00.1234+05:00', // nanoseconds are kept to precision
        '2018-08-21T14:50:00.123456-03:32',
        '2018-08-21T14:50:00.123456789+13:00', // across the international date border
    ];

    const coercedStrings = [
        ['2018-08-21T14:50:00Z', '2018-08-21T14:50:00+00:00'], // Z is allowed, but will be normalized
        ['2018-08-21T14:50:00-00:00', '2018-08-21T14:50:00+00:00'], // negative zero
        ['2018-08-21T14:50:00.000Z', '2018-08-21T14:50:00+00:00'], // superfluous nanoseconds are cut off
        ['2018-08-21T14:50:00.123400+00:00', '2018-08-21T14:50:00.1234+00:00'], // superfluous nanosecond precision is cut off
        ['2018-08-21T14:50:00+00:00', '2018-08-21T14:50:00+00:00'],
        ['2018-08-21T14:50Z', '2018-08-21T14:50:00+00:00'], // second part is added
    ];

    const invalidStrings = [
        'something',
        '2018-08-21+04:00',
        '2018-08-21T+04:00',
        '14:50:00',
        '2018-08-21',
        '2018-02-29T14:50:00Z', // no leap year
        '2018-08-21T14:50:00.1234567890Z', // too many fraction digits
        '2018-08-21T24:00:00Z', // no wrapping (as opposed to DateTime...)
        '2018-08-21T24:00:01Z', // this is consistent to DateTime

        // we're strict on the offset format
        '2018-08-21T14:50:00+01',
        '2018-08-21T14:50:00+0000',

        // zone id is not allowed
        '2018-08-21T14:50:00[Europe/Berlin]',
        '2018-08-21T14:50:00[UTC]',
        '2018-08-21T14:50:00+00:00[UTC]',
        '2018-08-21T14:50:00+02:00[UTC]',
        '2018-08-21T14:50:00-01:00[Europe/Berlin]',

        // leap seconds are not supported for anything but Instant by js-joda...
        '1982-06-30T23:59:60Z',
        '1982-06-30T23:59:60.123Z',
        '1982-07-01T23:59:60Z',
    ];

    function coerce(str: string): string {
        const stored = serializeForStorage(GraphQLOffsetDateTime.parseValue(str));
        return GraphQLOffsetDateTime.serialize(stored);
    }

    for (const str of validStrings) {
        it(`accepts ${str}`, () => {
            expect(coerce(str)).to.equal(str);
        });
    }

    for (const [input, result] of coercedStrings) {
        it(`coerces ${input} to ${result}`, () => {
            expect(coerce(input)).to.equal(result);
        });
    }

    for (const str of invalidStrings) {
        it(`rejects ${str}`, () => {
            expect(() => coerce(str)).to.throw(`Invalid ISO 8601 OffsetDateTime: ${str}`);
        });
    }

    it('rejects values without timezone', () => {
        const str = '2018-08-21T14:50:00';
        expect(() => coerce(str)).to.throw(`OffsetDateTime is missing timezone offset: ${str}`);
    });

    it('sets offset and timestamp properly in stored format', () => {
        const stored = serializeForStorage(
            GraphQLOffsetDateTime.parseValue(`2018-08-21T14:50:00.1234+03:30`),
        );
        // timestamp is an instant (DateTime), so nanoseconds are stored as 3-digit groups
        expect(stored.timestamp).to.equal(`2018-08-21T11:20:00.123400Z`);
        expect(stored.offset).to.equal(`+03:30`);
    });

    it('stores Z offset as +00:00', () => {
        const stored = serializeForStorage(
            GraphQLOffsetDateTime.parseValue(`2018-08-21T14:50:00.1234Z`),
        );
        expect(stored.timestamp).to.equal(`2018-08-21T14:50:00.123400Z`);
        expect(stored.offset).to.equal(`+00:00`);
    });
});
