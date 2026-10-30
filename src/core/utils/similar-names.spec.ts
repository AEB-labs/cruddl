import { describe, expect, it } from 'vitest';
import { getSimilarNames } from './similar-names.js';

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
