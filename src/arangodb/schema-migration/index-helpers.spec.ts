import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { TEMP_DATABASE_CONFIG } from '../../testing/regression-tests/initialization.js';
import { createSimpleModel } from '../../testing/utils/create-simple-model.js';
import { calculateRequiredIndexOperations, getRequiredIndicesFromModel } from './index-helpers.js';

describe('index-helpers', () => {
    it('extracts persistent and vector indices from the model', () => {
        const model = createSimpleModel(gql`
            type Product @rootEntity {
                key: String @key
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 768, nLists: 100)
                code: String @index
            }
        `);

        const requiredIndices = getRequiredIndicesFromModel(model);
        const vectorIndex = requiredIndices.find((index) => index.type === 'vector');
        const persistentIndex = requiredIndices.find(
            (index) => index.type === 'persistent' && index.fields.join(',') === 'code',
        );

        expect(vectorIndex).to.not.be.undefined;
        expect(vectorIndex!.type).to.equal('vector');
        expect(vectorIndex!.name).to.equal('vector_embedding');
        expect(vectorIndex!.fields).to.deep.equal(['embedding']);
        if (vectorIndex && vectorIndex.type === 'vector') {
            expect(vectorIndex.params.metric).to.equal('cosine');
            expect(vectorIndex.params.dimension).to.equal(768);
            expect(vectorIndex.params.nLists).to.equal(100);
        }

        expect(persistentIndex).to.not.be.undefined;
    });

    it('does not recreate vector index when it already has the correct name', () => {
        const model = createSimpleModel(gql`
            type Product @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 3, nLists: 10)
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
        expect(result.indicesToCreate).to.deep.equal([]);
        expect(result.indicesToDelete).to.deep.equal([]);
    });
});
