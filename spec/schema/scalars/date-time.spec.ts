import { expect } from 'chai';
import { GraphQLDateTime } from '../../../src/schema/scalars/date-time';

describe('GraphQLDateTime', () => {
    const validStrings = [
        '2018-08-21T14:50:00Z',
        '2018-08-21T14:50:15Z',
        '2004-02-29T14:50:00Z', // leap year
        '2018-08-21T14:50:00.123Z',
        '2018-08-21T14:50:00.123456Z',
        '2018-08-21T14:50:00.123456789Z',
    ];

    // these coercions are important to have canonical representations of all instants so that search and equality works properly
    const coercedStrings = [
        ['2018-08-21T14:50:00.1Z', '2018-08-21T14:50:00.100Z'],
        ['2018-08-21T14:50:00.12Z', '2018-08-21T14:50:00.120Z'],
        ['2018-08-21T14:50:00.000Z', '2018-08-21T14:50:00Z'],
        ['2018-08-21T14:50:00.1234Z', '2018-08-21T14:50:00.123400Z'],
        ['2018-08-21T14:50:00.12345Z', '2018-08-21T14:50:00.123450Z'],
        ['2018-08-21T14:50:00.123000Z', '2018-08-21T14:50:00.123Z'],
        ['2018-08-21T14:50:00.1234567Z', '2018-08-21T14:50:00.123456700Z'],
        ['2018-08-21T14:50:00.12345678Z', '2018-08-21T14:50:00.123456780Z'],
        ['2018-08-21T14:50:00+00:00', '2018-08-21T14:50:00Z'],
        ['2018-08-21T14:50:00+00:00[UTC]', '2018-08-21T14:50:00Z'], // not really important but nice to have
        ['1982-06-30T23:59:60Z', '1982-06-30T23:59:59Z'], // leap seconds are normalized, sacrificing accuracy for potential parse errors in other libraries (I guess this is ok)
        ['1982-06-30T23:59:60.123Z', '1982-06-30T23:59:59.123Z'], // so it just subtracts one second in leap seconds
        ['1982-07-01T23:59:60Z', '1982-07-01T23:59:59Z'], // leap seconds are also normalized where there can't possibly be any
        ['2018-08-21T24:00:00Z', '2018-08-22T00:00:00Z'], // 24:00:00 wraps
        ['2018-08-21T14:50Z', '2018-08-21T14:50:00Z'], // second part is added
    ];

    const invalidStrings = [
        'something',
        '2018-08-21T14:50:00+04:00[Europe/Berlin]',
        '2018-08-21T14:50:00[Europe/Berlin]',
        '2018-08-21+04:00',
        '2018-08-21T+04:00',
        '2018-08-21T14:50:00+0000', // don't really know why this does not work but its ok
        '2018-08-21T14:50:00[UTC]', // timezone id without offset does not work
        '14:50:00',
        '2018-08-21',
        '2018-02-29T14:50:00Z', // no leap year
        '2018-08-21T14:50:00.1234567890Z', // too many fraction digits
        '2018-08-21T24:00:01Z',
    ];

    for (const str of validStrings) {
        it(`accepts ${str}`, () => {
            expect(GraphQLDateTime.parseValue(str)).to.equal(str);
        });
    }

    for (const [input, result] of coercedStrings) {
        it(`coerces ${input} to ${result}`, () => {
            expect(GraphQLDateTime.parseValue(input)).to.equal(result);
        });
    }

    for (const str of invalidStrings) {
        it(`rejects ${str}`, () => {
            expect(() => GraphQLDateTime.parseValue(str)).to.throw(
                `Invalid ISO 8601 DateTime: ${str}`,
            );
        });
    }

    it('rejects values without timezone', () => {
        const str = '2018-08-21T14:50:00';
        expect(() => GraphQLDateTime.parseValue(str)).to.throw(
            `DateTime is missing timezone specifier (should be UTC): ${str}`,
        );
    });

    it('rejects other timezones than UTC', () => {
        const str = '2018-08-21T14:50:00+04:00';
        expect(() => GraphQLDateTime.parseValue(str)).to.throw(`DateTime should be in UTC: ${str}`);
    });

    it('rejects other timezones than UTC with milliseconds', () => {
        const str = '2018-08-21T14:50:00.123+04:00';
        expect(() => GraphQLDateTime.parseValue(str)).to.throw(`DateTime should be in UTC: ${str}`);
    });
});
