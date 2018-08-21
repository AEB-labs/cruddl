import { expect } from 'chai';
import { GraphQLLocalTime } from '../../../src/schema/scalars/local-time';

describe('GraphQLLocalTime', () => {
    const validStrings = [
        '14:50:00',
        '24:00:00'
    ];

    const invalidStrings = [
        'something',
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
        '23:59:60' // leap seconds are not supported here
    ];

    for (const str of validStrings) {
        it(`accepts ${str}`, () => {
            expect(GraphQLLocalTime.parseValue(str)).to.equal(str);
        });
    }

    for (const str of invalidStrings) {
        it(`rejects ${str}`, () => {
            expect(() => GraphQLLocalTime.parseValue(str)).to.throw(`Invalid ISO 8601 LocalTime: ${str}`);
        });
    }
});
