import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    validate,
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

    it('rejects duplicate storedValues and offers to remove them', () => {
        const source = `
            type Foo @rootEntity {
                title: String
                category: String
                embedding: [Float] @vectorIndex(dimension: 128, defaultNProbe: 10, maxNProbe: 50, storedValues: ["title", "category", "title"])
            }
        `;
        assertValidatorRejects(source, '"title" is included multiple times in storedValues.');
        const newSource = applyQuickFix(validate(source).messages, 'Remove duplicate');
        expect(newSource).to.equal(
            source.replace('["title", "category", "title"]', '["title", "category"]'),
        );
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    });

    describe('factory', () => {
        function getSource(args: string) {
            return `
                type Foo @rootEntity {
                    embedding: [Float] @vectorIndex(dimension: 128, ${args}, defaultNProbe: 10, maxNProbe: 50)
                }
            `;
        }

        it('accepts IVF factories with a matching nLists', () => {
            assertValidatorAcceptsAndDoesNotWarn(getSource('nLists: 100, factory: "IVF100,Flat"'));
            assertValidatorAcceptsAndDoesNotWarn(
                getSource('nLists: 100, factory: "IVF100_HNSW32,PQ16"'),
            );
        });

        it('rejects factories that are not IVF', () => {
            assertValidatorRejects(
                getSource('nLists: 100, factory: "HNSW32"'),
                'The factory "HNSW32" is not supported. It needs to start with an IVF index and specify an encoding, e.g. "IVF100,Flat".',
            );
        });

        it('rejects IVF factories without an encoding', () => {
            assertValidatorRejects(
                getSource('nLists: 100, factory: "IVF100"'),
                'The factory "IVF100" is not supported. It needs to start with an IVF index and specify an encoding, e.g. "IVF100,Flat".',
            );
        });

        it('rejects an nLists that does not match the factory and offers to fix it', () => {
            const source = getSource('nLists: 10, factory: "IVF100,Flat"');
            assertValidatorRejects(
                source,
                'nLists (10) needs to match the number of lists in the factory "IVF100,Flat" (100).',
            );
            const newSource = applyQuickFix(validate(source).messages, 'Change nLists to 100');
            expect(newSource).to.equal(getSource('nLists: 100, factory: "IVF100,Flat"'));
            assertValidatorAcceptsAndDoesNotWarn(newSource);
        });

        it('rejects a factory without nLists and offers to add it', () => {
            const source = getSource('factory: "IVF100,Flat"');
            assertValidatorRejects(
                source,
                'nLists needs to be specified if a factory is specified, and it needs to match the number of lists in the factory (100).',
            );
            const newSource = applyQuickFix(validate(source).messages, 'Add nLists: 100');
            expect(newSource).to.equal(getSource('nLists: 100, factory: "IVF100,Flat"'));
            assertValidatorAcceptsAndDoesNotWarn(newSource);
        });
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

    describe('quick fixes', () => {
        const vectorIndex = '@vectorIndex(dimension: 128, defaultNProbe: 10, maxNProbe: 50)';

        function getQuickFixes(source: string) {
            return validate(source)
                .messages.flatMap((m) => m.quickFixes)
                .map((q) => [q.description, q.isPreferred]);
        }

        function expectQuickFix(source: string, description: string, expectedSource: string) {
            const newSource = applyQuickFix(validate(source).messages, description);
            expect(newSource).to.equal(expectedSource);
            assertValidatorAcceptsAndDoesNotWarn(newSource);
        }

        it('prefers to change a Float field to a list', () => {
            const source = `type Foo @rootEntity { embedding: Float ${vectorIndex} }`;
            expect(getQuickFixes(source)).to.deep.equal([['Change type to "[Float]"', true]]);
            expectQuickFix(
                source,
                'Change type to "[Float]"',
                `type Foo @rootEntity { embedding: [Float] ${vectorIndex} }`,
            );
        });

        it('offers to change a list of another type to [Float]', () => {
            const source = `type Foo @rootEntity { embedding: [Int] ${vectorIndex} }`;
            expect(getQuickFixes(source)).to.deep.equal([['Change type to "[Float]"', false]]);
            expectQuickFix(
                source,
                'Change type to "[Float]"',
                `type Foo @rootEntity { embedding: [Float] ${vectorIndex} }`,
            );
        });

        it('offers to change a non-list field of another type to [Float] only once', () => {
            const source = `type Foo @rootEntity { embedding: Int ${vectorIndex} }`;
            assertValidatorRejects(source, [
                'Vector indices can only be defined on list fields, but "Foo.embedding" is not a list field.',
                'Vector indices can only be defined on fields of type "[Float]", but the type of "Foo.embedding" is "Int".',
            ]);
            expect(getQuickFixes(source)).to.deep.equal([['Change type to "[Float]"', false]]);
        });

        it('offers to remove @vectorIndex from fields of child entities', () => {
            const source = `
                type Foo @rootEntity { items: [Item] }
                type Item @childEntity { embedding: [Float] ${vectorIndex} }
            `;
            expect(getQuickFixes(source)).to.deep.equal([['Remove @vectorIndex', false]]);
            expectQuickFix(
                source,
                'Remove @vectorIndex',
                source.replace(`[Float] ${vectorIndex}`, '[Float]'),
            );
        });

        it('offers to change defaultNProbe or maxNProbe if defaultNProbe is too large', () => {
            const source = `
                type Foo @rootEntity {
                    embedding: [Float] @vectorIndex(dimension: 128, defaultNProbe: 100, maxNProbe: 50)
                }
            `;
            expect(getQuickFixes(source)).to.deep.equal([
                ['Change defaultNProbe to 50', false],
                ['Change maxNProbe to 100', false],
            ]);
            expectQuickFix(
                source,
                'Change defaultNProbe to 50',
                source.replace('defaultNProbe: 100', 'defaultNProbe: 50'),
            );
            expectQuickFix(
                source,
                'Change maxNProbe to 100',
                source.replace('maxNProbe: 50', 'maxNProbe: 100'),
            );
        });
    });
});
