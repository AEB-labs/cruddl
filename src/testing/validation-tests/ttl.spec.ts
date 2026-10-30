import { gql } from 'graphql-tag';
import { describe, expect, it } from 'vitest';
import { applyChangeSet } from '../../core/model/change-set/apply-change-set.js';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from '../utils/source-validation-utils.js';

describe('timeToLive config', () => {
    it('accepts simple case', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                }
            `,
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('rejects missing type', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                }
            `,
            'No rootEntity with the name "WrongType" is defined.',
            {
                timeToLive: [
                    {
                        typeName: 'WrongType',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('rejects non-root-entity type', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                }

                type ValueObject @valueObject {
                    finishedAt: DateTime
                }
            `,
            'No rootEntity with the name "ValueObject" is defined.',
            {
                timeToLive: [
                    {
                        typeName: 'ValueObject',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('rejects missing field', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                }
            `,
            'Type "Test" does not have a field "wrongField".',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'wrongField',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('rejects String field', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: String
                }
            `,
            'The dateField of time-to-live-configurations must be of type LocalDate, DateTime or OffsetDateTime.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('rejects fields that traverses root entities', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: String
                    test2: Test2 @relation
                }

                type Test2 @rootEntity {
                    finishedAt: String
                }
            `,
            'Field "Test.test2" resolves to a different root entity, but this path cannot traverse root entity boundaries.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'test2.finishedAt',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('rejects list fields', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: [DateTime]
                }
            `,
            'Indices can not be defined on lists, but "Test.finishedAt" has a list type.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                    },
                ],
            },
        );
    });

    it('accepts a simple cascadeField', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    parent: Test @relation(inverseOf: "nested")
                }
            `,
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('accepts multiple cascadeFields', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    parent: Test @relation(inverseOf: "nested")
                    nested: [Nested2] @relation
                }

                type Nested2 @rootEntity {
                    parent: Nested @relation(inverseOf: "nested")
                }
            `,
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested', 'nested.nested'],
                    },
                ],
            },
        );
    });

    it('warns about duplicate cascadeFields', () => {
        assertValidatorWarns(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    parent: Test @relation(inverseOf: "nested")
                }
            `,
            'Field "nested" is included multiple times. This will be an error in a future release.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested', 'nested'],
                    },
                ],
            },
        );
    });

    it('accepts recursive cascadeFields', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    parentTest: Test @relation(inverseOf: "nested")
                    parentNested: Nested @relation(inverseOf: "nested")
                    nested: [Nested] @relation
                }
            `,
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested', 'nested.nested', 'nested.nested.nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields that are not relations', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                }
            `,
            'Field "Test.finishedAt" is not a relation and therefore cannot be configured for cascading deletion.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['finishedAt'],
                    },
                ],
            },
        );
    });

    it('warns about cascadeFields that are already CASCADE', () => {
        assertValidatorWarns(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation(onDelete: CASCADE)
                }

                type Nested @rootEntity {
                    parent: Test @relation(inverseOf: "nested")
                }
            `,
            'Field "Test.nested" is already annotated with @relation(onDelete=CASCADE) and listing it here does not have an effect.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields with holes', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    parent: Test @relation(inverseOf: "nested")
                    nested: [Nested2] @relation
                }

                type Nested2 @rootEntity {
                    parent: Nested @relation(inverseOf: "nested")
                }
            `,
            'Sub-path "nested" needs to be included in the cascadeFields or annotated with @relation(onDelete=CASCADE).',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested.nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields on inverse relations', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation(inverseOf: "test")
                }

                type Nested @rootEntity {
                    test: Test @relation
                }
            `,
            'Field "Test.nested" is an inverse relation and cannot be used in the cascadeFields.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields on implicit n:m relations', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    key: String
                }
            `,
            'cascadeFields only support 1-to-n and 1-to-1 relations. You can change "Test.nested" to a 1-to-n relation by adding a field with the @relation(inverseOf: "nested") directive to the target type "Nested".',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields on implicit 1:m relations', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: Nested @relation
                }

                type Nested @rootEntity {
                    key: String
                }
            `,
            'cascadeFields only support 1-to-n and 1-to-1 relations. You can change "Test.nested" to a 1-to-1 relation by adding a field with the @relation(inverseOf: "nested") directive to the target type "Nested".',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields on explicit n:m relations', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: [Nested] @relation
                }

                type Nested @rootEntity {
                    key: String
                    tests: [Test] @relation(inverseOf: "nested")
                }
            `,
            'cascadeFields only support 1-to-n and 1-to-1 relations. You can change "Test.nested" to a 1-to-n relation by changing the type of "Nested.tests" to "Test".',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('rejects cascadeFields on explicit 1:m relations', () => {
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: Nested @relation
                }

                type Nested @rootEntity {
                    key: String
                    tests: [Test] @relation(inverseOf: "nested")
                }
            `,
            'cascadeFields only support 1-to-n and 1-to-1 relations. You can change "Test.nested" to a 1-to-1 relation by changing the type of "Nested.tests" to "Test".',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    it('does not throw if cascadeFields are referencing relations that are non-object types', () => {
        // previously, we had a bug where this threw instead of reporting an error
        // it can quickly happen if there is a syntax error in the file that defines the relation type
        assertValidatorRejects(
            gql`
                type Test @rootEntity {
                    finishedAt: DateTime
                    nested: String @relation
                }
            `,
            'Type "String" cannot be used with @relation because it is not a root entity type.',
            {
                timeToLive: [
                    {
                        typeName: 'Test',
                        dateField: 'finishedAt',
                        expireAfterDays: 3,
                        cascadeFields: ['nested'],
                    },
                ],
            },
        );
    });

    describe('dateField paths', () => {
        const schema = `
            type Delivery @rootEntity {
                deliveryNumber: String @key
                arrival: DateTime
                items: [DeliveryItem]
                processing: ProcessingInfo
                dimensions: Dimensions
                forwarder: Forwarder @reference(keyField: "forwarderKey")
                forwarderKey: String
                handlingUnit: HandlingUnit @relation
                lastPackedAt: DateTime @collect(path: "items.packedAt", aggregate: MAX)
                pallets: [Pallet] @relation
                lastPalletPackedAt: DateTime @collect(path: "pallets.packedAt", aggregate: MAX)
            }
            type DeliveryItem @childEntity {
                packedAt: DateTime
                packages: [Package]
                delivery: Delivery @root
            }
            type Package @childEntity {
                packedAt: DateTime
                item: DeliveryItem @parent
            }
            type ProcessingInfo @entityExtension {
                finishedAt: DateTime
            }
            type Dimensions @valueObject {
                measuredAt: DateTime
            }
            type Forwarder @rootEntity {
                forwarderKey: String @key
                createdAt: DateTime
            }
            type Pallet @rootEntity {
                packedAt: DateTime
            }
            type HandlingUnit @rootEntity {
                packedAt: DateTime
                delivery: Delivery @relation(inverseOf: "handlingUnit")
            }
        `;

        /**
         * Validates a TTL config with the given dateField and returns the messages with the text they point at
         */
        function getMessages(dateField: string) {
            const ttl = `timeToLive:\n  - typeName: Delivery\n    dateField: ${dateField}\n    expireAfterDays: 3\n`;
            const project = new Project([
                new ProjectSource('schema.graphqls', schema),
                new ProjectSource('ttl.yaml', ttl),
            ]);
            return project
                .validate()
                .messages.filter((m) => m.location?.sourceName === 'ttl.yaml')
                .map(
                    (m) =>
                        `${m.severity}: ${m.message} @ ${ttl.slice(m.location!.start.offset, m.location!.end.offset)}`,
                );
        }

        it('accepts fields of entity extensions and value objects', () => {
            expect(getMessages('processing.finishedAt')).to.deep.equal([]);
            expect(getMessages('dimensions.measuredAt')).to.deep.equal([]);
        });

        it('warns about fields within lists', () => {
            expect(getMessages('items.packedAt')).to.deep.equal([
                'WARNING: Field "Delivery.items" is a list and cannot be navigated into. This will be an error in a future release. @ packedAt',
            ]);
        });

        it('offers similar field names', () => {
            const ttl = `timeToLive:\n  - typeName: Delivery\n    dateField: processing.finishedat\n    expireAfterDays: 3\n`;
            const project = new Project([
                new ProjectSource('schema.graphqls', schema),
                new ProjectSource('ttl.yaml', ttl),
            ]);
            const quickFix = project
                .validate()
                .messages.flatMap((m) => m.quickFixes)
                .find((q) => q.description === 'Change to "finishedAt"');
            expect(quickFix).not.to.be.undefined;
            const newProject = applyChangeSet(project, quickFix!.getChangeSet());
            expect(newProject.sources[1].body).to.equal(ttl.replace('finishedat', 'finishedAt'));
            expect(newProject.validate().hasErrors()).to.be.false;
        });

        it('warns about collect fields', () => {
            expect(getMessages('lastPackedAt')).to.deep.equal([
                'WARNING: Field "Delivery.lastPackedAt" is a collect field, but collect fields cannot be used in this path. This will be an error in a future release. @ lastPackedAt',
            ]);
        });

        it('warns about collect fields that traverse relations', () => {
            expect(getMessages('lastPalletPackedAt')).to.deep.equal([
                'WARNING: Field "Delivery.lastPalletPackedAt" is a collect field, but collect fields cannot be used in this path. This will be an error in a future release. @ lastPalletPackedAt',
            ]);
        });

        it('warns about parent fields', () => {
            expect(getMessages('items.packages.item.packedAt')).to.deep.equal([
                'WARNING: Field "Delivery.items" is a list and cannot be navigated into. This will be an error in a future release. @ packages',
                'WARNING: Field "DeliveryItem.packages" is a list and cannot be navigated into. This will be an error in a future release. @ item',
                'WARNING: Field "Package.item" is a parent field and cannot be used in a field path. This will be an error in a future release. @ item',
            ]);
        });

        it('rejects unknown fields', () => {
            expect(getMessages('processing.finishedat')).to.deep.equal([
                'ERROR: Type "ProcessingInfo" does not have a field "finishedat". @ finishedat',
            ]);
        });

        it('rejects navigating into scalars', () => {
            expect(getMessages('arrival.date')).to.deep.equal([
                'ERROR: Type "DateTime" is not an object type and cannot be navigated into. @ date',
            ]);
        });

        it('rejects references', () => {
            expect(getMessages('forwarder.createdAt')).to.deep.equal([
                'ERROR: Field "Delivery.forwarder" resolves to a different root entity, but this path cannot traverse root entity boundaries. @ forwarder',
            ]);
        });

        it('rejects relations', () => {
            expect(getMessages('handlingUnit.packedAt')).to.deep.equal([
                'ERROR: Field "Delivery.handlingUnit" resolves to a different root entity, but this path cannot traverse root entity boundaries. @ handlingUnit',
            ]);
        });

        it('rejects root fields', () => {
            expect(getMessages('items.delivery.arrival')).to.deep.equal([
                'WARNING: Field "Delivery.items" is a list and cannot be navigated into. This will be an error in a future release. @ delivery',
                'ERROR: Field "DeliveryItem.delivery" is a root field and cannot be used in a field path. @ delivery',
            ]);
        });

        it('rejects empty segments', () => {
            expect(getMessages('processing..finishedAt')).to.deep.equal([
                'ERROR: The dateField should be a path, defined as field names separated by dots. @ dateField: processing..finishedAt',
            ]);
        });
    });
});
