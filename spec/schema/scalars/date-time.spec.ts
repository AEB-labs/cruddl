import { GraphQLDateTime } from '../../../src/schema/scalars/date-time';
import { expect } from 'chai';

describe('GraphQLDateTime', () => {
    const validStrings = [
        '2018-08-21T14:50:00Z',
        '2018-08-21T14:50:00',
        '2018-08-21T14:50:00+04:00',
        '2018-08-21'
    ];

    const invalidStrings = [
        'something',
        '2018-08-21T14:50:00+04:00[Europe/Berlin]',
        '2018-08-21T14:50:00[Europe/Berlin]',
        '2018-08-21+04:00',
        '2018-08-21T+04:00',
        '14:50:00',
        '1981-06-30T23:59:60Z' // leap seconds are currently not supported (may change in the future)
    ];

    for (const str of validStrings) {
        it(`accepts ${str}`, () => {
            expect(GraphQLDateTime.parseValue(str)).to.equal(str);
        });
    }

    for (const str of invalidStrings) {
        it(`rejects ${str}`, () => {
            expect(() => GraphQLDateTime.parseValue(str)).to.throw(`Invalid ISO 8601 DateTime: ${str}`);
        });
    }
});
