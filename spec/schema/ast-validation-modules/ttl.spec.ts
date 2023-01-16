import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from './helpers';
import gql from 'graphql-tag';

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
            'Type "Test" does not have a field "wrongField"',
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
            'Field "Test.test2" resolves to a root entity, but time-to-live-definitions can not cross root entity boundaries.',
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
});
