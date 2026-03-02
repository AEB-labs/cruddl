import { expect } from 'chai';
import { describe, it } from 'vitest';
import { groupByEquivalence } from '../../src/utils/group-by-equivalence.js';

describe('groupByEquivalence', () => {
    it('groups correctly', () => {
        const groups = groupByEquivalence(
            ['a', 'c', 'b', 'A', 'C', 'C'],
            (a, b) => a.toUpperCase() === b.toUpperCase(),
        );
        expect(groups).to.deep.equal([['a', 'A'], ['c', 'C', 'C'], ['b']]);
    });
});
