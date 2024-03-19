import { print } from 'graphql';
import gql from 'graphql-tag';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from './helpers';

describe('system field override validation', () => {
    it('is valid on non redundant system fields', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            print(gql`
                type Root @rootEntity {
                    id: ID @key
                    createdAt: DateTime @hidden
                    dummy: String
                }

                type Root2 @rootEntity {
                    id: ID @hidden
                    updatedAt: DateTime @hidden
                    dummy: String
                }
            `),
        );
    });

    it('warns on redundant system field "id"', () => {
        assertValidatorWarns(
            print(gql`
                type Root @rootEntity {
                    id: ID
                    dummy: String
                }
            `),
            'Manually declaring system field "id" is redundant. Either add a suitable directive or consider removing the field',
        );
    });

    it('warns on redundant system field "createdAt"', () => {
        assertValidatorWarns(
            print(gql`
                type Root @rootEntity {
                    createdAt: DateTime
                    dummy: String
                }
            `),
            'Manually declaring system field "createdAt" is redundant. Either add a suitable directive or consider removing the field',
        );
    });

    it('warns on redundant system field "updatedAt"', () => {
        assertValidatorWarns(
            print(gql`
                type Root @rootEntity {
                    updatedAt: DateTime
                    dummy: String
                }
            `),
            'Manually declaring system field "updatedAt" is redundant. Either add a suitable directive or consider removing the field',
        );
    });

    it('errors on system field "id" type mismatch', () => {
        assertValidatorRejects(
            print(gql`
                type Root @rootEntity {
                    id: String
                    dummy: String
                }
            `),
            'System field "id" must be of type "ID"',
        );
    });

    it('errors on system field "createdAt" type mismatch', () => {
        assertValidatorRejects(
            print(gql`
                type Root @rootEntity {
                    createdAt: String
                    dummy: String
                }
            `),
            'System field "createdAt" must be of type "DateTime"',
        );
    });

    it('errors on system field "updatedAt" type mismatch', () => {
        assertValidatorRejects(
            print(gql`
                type Root @rootEntity {
                    updatedAt: String
                    dummy: String
                }
            `),
            'System field "updatedAt" must be of type "DateTime"',
        );
    });

    it('errors on not allowed directives on system fields', () => {
        assertValidatorRejects(
            print(gql`
                type Root @rootEntity {
                    id: ID @relation
                    dummy: String
                }
            `),
            'Directive "@relation" is not allowed on system field "id" and will be discarded',
        );
    });
});
