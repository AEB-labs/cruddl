import { describe, expect, it } from 'vitest';
import { didYouMean, getSimilarNames } from './similar-names.js';

describe('getSimilarNames', () => {
    it('finds names with a small edit distance, most similar first', () => {
        expect(
            getSimilarNames('delivery', ['deliveries', 'delivry', 'Delivery', 'handlingUnit']),
        ).to.deep.equal(['Delivery', 'delivry']);
    });

    it('does not return the name itself', () => {
        expect(
            getSimilarNames('delivery', ['deliveries', 'delivry', 'Delivery', 'handlingUnit']),
        ).to.deep.equal(['Delivery', 'delivry']);
    });

    it('is stricter for short names', () => {
        expect(getSimilarNames('id', ['key', 'ids'])).to.deep.equal(['ids']);
    });
});

describe('didYouMean', () => {
    it('returns an empty string without suggestions', () => {
        expect(didYouMean([])).to.equal('');
    });

    it('formats one, two and more suggestions like graphql-js', () => {
        expect(didYouMean(['a'])).to.equal(' Did you mean "a"?');
        expect(didYouMean(['a', 'b'])).to.equal(' Did you mean "a" or "b"?');
        expect(didYouMean(['a', 'b', 'c'])).to.equal(' Did you mean "a", "b", or "c"?');
    });

    it('lists at most five suggestions', () => {
        expect(didYouMean(['a', 'b', 'c', 'd', 'e', 'f'])).to.equal(
            ' Did you mean "a", "b", "c", "d", or "e"?',
        );
    });
});
