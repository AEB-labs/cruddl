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
