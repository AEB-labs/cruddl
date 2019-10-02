import { expect } from 'chai';
import { groupByEquivalence } from '../../src/utils/group-by-equivalence';

describe('groupByEquivalence', () => {
    it('groups correctly', () => {
        const groups = groupByEquivalence(['a', 'c', 'b', 'A', 'C', 'C'], (a, b) => a.toUpperCase() === b.toUpperCase());
        expect(groups).to.deep.equal([['a', 'A'], ['c', 'C', 'C'], ['b']]);
    });
});
