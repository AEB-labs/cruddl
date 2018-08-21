import { expect } from 'chai';
import { GraphQLLocalDate } from '../../../src/schema/scalars/local-date';

describe('GraphQLLocalDate', () => {
    const validStrings = [
        '2018-08-21',
        '2004-02-29',
    ];

    const invalidStrings = [
        'something',
        '2018-08-21T14:50:00Z',
        '2018-08-21T14:50:00',
        '2018-08-21T14:50:00+04:00',
        '2018-08-21T14:50:00+04:00[Europe/Berlin]',
        '2018-08-21T14:50:00[Europe/Berlin]',
        '2018-08-21+04:00',
        '2018-08-21T+04:00',
        '14:50:00',
        '2005-02-29',
    ];

    for (const str of validStrings) {
        it(`accepts ${str}`, () => {
            expect(GraphQLLocalDate.parseValue(str)).to.equal(str);
        });
    }

    for (const str of invalidStrings) {
        it(`rejects ${str}`, () => {
            expect(() => GraphQLLocalDate.parseValue(str)).to.throw(`Invalid ISO 8601 LocalDate: ${str}`);
        });
    }
});
