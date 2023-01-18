import { assertValidatorAccepts, assertValidatorRejects } from './helpers';
import gql from 'graphql-tag';

describe('timeToLive config', () => {
    it('accepts simple case', () => {
        assertValidatorAccepts(
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
});
