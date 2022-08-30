import { gql } from 'graphql-tag';
import {
    assertValidatorAccepts,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from './helpers';

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
            'Enums cannot define value "true".',
        );
    });

    it('warns about lowercase enum values', () => {
        assertValidatorWarns(
            gql`
                enum Color {
                    GOOD
                    bad
                }
            `,
            'Enum values should be UPPER_CASE.',
        );
    });
});
