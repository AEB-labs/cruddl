import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
} from '../utils/source-validation-utils.js';

describe('vector indices validator', () => {
    it('accepts a valid vector index on a root entity field', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10)
            }
        `);
    });

    it('rejects vector index on child entity field', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10)
            }
        `,
            '@vectorIndex is only allowed in root entity fields.',
        );
    });

    it('rejects vector index on value object field', () => {
        assertValidatorRejects(
            `
            type Foo @valueObject {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10)
            }
        `,
            '@vectorIndex is only allowed in root entity fields.',
        );
    });

    it('rejects vector index on entity extension field', () => {
        assertValidatorRejects(
            `
            type Foo @entityExtension {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10)
            }
        `,
            '@vectorIndex is only allowed in root entity fields.',
        );
    });

    it('rejects vector index on non-list field', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: Float @vectorIndex(metric: COSINE, dimension: 128, nLists: 10)
            }
        `,
            'Vector indices can only be defined on list fields, but "Foo.embedding" is not a list field.',
        );
    });

    it('rejects vector index on non-Float list field', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [String!]! @vectorIndex(metric: COSINE, dimension: 128, nLists: 10)
            }
        `,
            'Vector indices can only be defined on fields of type "[Float]", but the type of "Foo.embedding" is "[String]".',
        );
    });

    it('rejects vector index with non-positive dimension', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 0, nLists: 10)
            }
        `,
            'A vector index must specify a positive dimension.',
        );
    });

    it('rejects vector index with non-positive nLists', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 0)
            }
        `,
            'A vector index must specify a positive nLists value.',
        );
    });

    it('rejects vector index with non-positive defaultNProbe', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 0)
            }
        `,
            'defaultNProbe must be positive if specified.',
        );
    });

    it('rejects vector index with non-positive trainingIterations', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, trainingIterations: 0)
            }
        `,
            'trainingIterations must be positive if specified.',
        );
    });

    it('rejects vector index with more than 32 storedValues entries', () => {
        const storedValues = Array.from({ length: 33 })
            .map((_, i) => `"field${i}"`)
            .join(', ');

        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, storedValues: [${storedValues}])
            }
        `,
            'storedValues must contain at most 32 entries.',
        );
    });

    it('rejects vector index with invalid storedValues path', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, storedValues: ["tenantId"])
            }
        `,
            'Type "Foo" does not have a field "tenantId".',
        );
    });

    it('accepts vector index with optional parameters', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity {
                embedding: [Float]
                    @vectorIndex(
                        sparse: true
                        metric: INNER_PRODUCT
                        dimension: 768
                        nLists: 100
                        defaultNProbe: 5
                        trainingIterations: 30
                        factory: "IVF100,Flat"
                        storedValues: ["tenantId", "category.code"]
                    )
                tenantId: String
                category: Category
            }

            type Category @entityExtension {
                code: String
            }
        `);
    });
});
