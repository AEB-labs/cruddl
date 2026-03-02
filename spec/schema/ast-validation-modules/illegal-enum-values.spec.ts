import { gql } from 'graphql-tag';
import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from './helpers.js';

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

    it('rejects enums with non-unique enum value', () => {
        assertValidatorRejects(
            gql`
                enum Goodness {
                    GOOD
                    GOOD
                    BAD
                }
            `,
            'Enum value "Goodness.GOOD" can only be defined once.',
        );
    });

    it('accepts the same enum value in two different enum declarations', () => {
        assertValidatorAcceptsAndDoesNotWarn(gql`
            enum ThemeKind {
                LIGHT
                DARK
            }

            enum WeightClass {
                LIGHT
                HEAVY
            }
        `);
    });
});
