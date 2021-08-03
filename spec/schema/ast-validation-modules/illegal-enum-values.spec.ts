import { gql } from 'graphql-tag';
import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

describe('enum declaration validation', () => {
    it('accepts regular enums', () => {
        assertValidatorAcceptsAndDoesNotWarn(gql`
            enum Color {
                GREEN
                RED
                LIGHT_GRAY
            }
        `);
    });

    it('rejects true as enum value name', () => {
        assertValidatorRejects(
            gql`
                enum Color {
                    OK
                    true
                }
            `,
            'Enums cannot define value "true".'
        );
    });
});
