import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorWarns,
} from '../utils/source-validation-utils.js';

describe('no-non-null-types validator', () => {
    it('warns for a non-null scalar field', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: String!
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('warns for a non-null list field', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: [String]!
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('warns for a non-null element inside a list', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: [String!]
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('warns once for a field with multiple non-null markers', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                foo: [String!]!
            }
        `,
            'Non-null types (!) have no effect and should be removed.',
        );
    });

    it('accepts a nullable scalar field', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    });

    it('accepts a nullable list field with nullable elements', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: [String]
            }
        `);
    });
});
