import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { TEMP_DATABASE_CONFIG } from '../../testing/regression-tests/initialization.js';
import { createSimpleModel } from '../../testing/utils/create-simple-model.js';
import { calculateRequiredIndexOperations, getRequiredIndicesFromModel } from './index-helpers.js';

describe('index-helpers', () => {
    it('extracts persistent indices from the model', () => {
        const model = createSimpleModel(gql`
            type Product @rootEntity {
                key: String @key
                embedding: [Float]
                    @vectorIndex(dimension: 768, nLists: 100, defaultNProbe: 10, maxNProbe: 50)
                code: String @index
            }
        `);

        const requiredIndices = getRequiredIndicesFromModel(model);

        // Vector indices are not returned - they are handled separately
        expect(requiredIndices.every((index) => index.type === 'persistent')).toBe(true);

        const persistentIndex = requiredIndices.find(
            (index) => index.type === 'persistent' && index.fields.join(',') === 'code',
        );
        expect(persistentIndex).to.not.be.undefined;
    });

    it('does not recreate vector index when it already has the correct name', () => {
        const model = createSimpleModel(gql`
            type Product @rootEntity {
                embedding: [Float]
                    @vectorIndex(dimension: 3, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `);

        const requiredIndices = getRequiredIndicesFromModel(model);
        const existingIndices = requiredIndices.map((index) => ({
            ...index,
            id: 'products/1234',
        }));

        const result = calculateRequiredIndexOperations(
            existingIndices,
            requiredIndices,
            TEMP_DATABASE_CONFIG,
        );
        expect(result.persistentIndicesToCreate).to.deep.equal([]);
        expect(result.persistentIndicesToDelete).to.deep.equal([]);
    });
});
