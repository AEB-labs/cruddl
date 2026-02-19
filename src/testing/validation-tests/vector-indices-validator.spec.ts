import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
} from '../utils/source-validation-utils.js';

describe('vector indices validator', () => {
    it('accepts a valid vector index on a root entity field', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `);
    });

    it('accepts a vector index without metric (defaults to COSINE)', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `);
    });

    it('rejects vector index on child entity field', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            '@vectorIndex is only allowed in root entity fields.',
        );
    });

    it('rejects vector index on value object field', () => {
        assertValidatorRejects(
            `
            type Foo @valueObject {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            '@vectorIndex is only allowed in root entity fields.',
        );
    });

    it('rejects vector index on entity extension field', () => {
        assertValidatorRejects(
            `
            type Foo @entityExtension {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            '@vectorIndex is only allowed in root entity fields.',
        );
    });

    it('rejects vector index on non-list field', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: Float @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            'Vector indices can only be defined on list fields, but "Foo.embedding" is not a list field.',
        );
    });

    it('rejects vector index on non-Float list field', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [String!]! @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            'Vector indices can only be defined on fields of type "[Float]", but the type of "Foo.embedding" is "[String]".',
        );
    });

    it('rejects vector index with non-positive dimension', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 0, nLists: 10, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            'A vector index must specify a positive dimension.',
        );
    });

    it('rejects vector index with non-positive nLists', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 0, defaultNProbe: 10, maxNProbe: 50)
            }
        `,
            'A vector index must specify a positive nLists value.',
        );
    });

    it('rejects vector index without defaultNProbe', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, maxNProbe: 50)
            }
        `,
            'Directive "@vectorIndex" argument "defaultNProbe" of type "Int!" is required, but it was not provided.',
        );
    });

    it('rejects vector index with non-positive defaultNProbe', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 0, maxNProbe: 50)
            }
        `,
            'A vector index must specify a positive defaultNProbe value.',
        );
    });

    it('rejects vector index without maxNProbe', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10)
            }
        `,
            'Directive "@vectorIndex" argument "maxNProbe" of type "Int!" is required, but it was not provided.',
        );
    });

    it('rejects vector index with non-positive maxNProbe', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 0)
            }
        `,
            'A vector index must specify a positive maxNProbe value.',
        );
    });

    it('rejects vector index where defaultNProbe exceeds maxNProbe', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 100, maxNProbe: 50)
            }
        `,
            'defaultNProbe (100) must not exceed maxNProbe (50).',
        );
    });

    it('rejects vector index with non-positive trainingIterations', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50, trainingIterations: 0)
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
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50, storedValues: [${storedValues}])
            }
        `,
            'storedValues must contain at most 32 entries.',
        );
    });

    it('rejects vector index with invalid storedValues path', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(metric: COSINE, dimension: 128, nLists: 10, defaultNProbe: 10, maxNProbe: 50, storedValues: ["tenantId"])
            }
        `,
            'Type "Foo" does not have a field "tenantId".',
        );
    });

    it('rejects storedValues path that crosses a root entity boundary', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(dimension: 4, defaultNProbe: 10, maxNProbe: 50, storedValues: ["other"])
                other: Bar
            }
            type Bar @rootEntity {
                name: String
            }
        `,
            [
                'Field "Foo.other" resolves to a different root entity, but this path cannot traverse root entity boundaries.',
                'Type "Bar" is a root entity type and cannot be embedded. Consider adding @reference or @relation.',
            ],
        );
    });

    it('rejects storedValues with a nonexistent nested path segment', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity {
                embedding: [Float] @vectorIndex(dimension: 4, defaultNProbe: 10, maxNProbe: 50, storedValues: ["category.missing"])
                category: Category
            }
            type Category @entityExtension {
                code: String
            }
        `,
            'Type "Category" does not have a field "missing".',
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
                        maxNProbe: 100
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
