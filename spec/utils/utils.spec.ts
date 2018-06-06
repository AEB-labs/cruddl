import { expect } from 'chai';
import { joinWithAnd } from '../../src/utils/utils';

describe('utils', () => {
    describe('joinWithAnd', () => {
        it('works with length = 0', () => {
            expect(joinWithAnd([])).to.equal('');
        });

        it('works with length = 1', () => {
            expect(joinWithAnd(['a'])).to.equal('a');
        });

        it('works with length = 2', () => {
            expect(joinWithAnd(['a', 'b'])).to.equal('a and b');
        });

        it('works with length = 3', () => {
            expect(joinWithAnd(['a', 'b', 'c'])).to.equal('a, b, and c');
        });

        it('works with length = 4', () => {
            expect(joinWithAnd(['a', 'b', 'c', 'd'])).to.equal('a, b, c, and d');
        });
    });
});
