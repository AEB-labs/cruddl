import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorWarns,
} from '../utils/source-validation-utils.js';

describe('root-entities-without-read-roles validator', () => {
    it('rejects @roles without read or readWrite', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity @roles {
                foo: [String]
            }
        `,
            'No roles with read access are specified. Access is denied for everyone.',
        );
    });

    it('warns @roles with empty roles', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity @roles(read: "") {
                foo: [String]
            }
        `,
            'Specified empty string as role.',
        );
    });

    it('warns about @roles with wildcards', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity @roles(read: "user*") {
                foo: [String]
            }
        `,
            '@roles does not support wildcards or regular expressions; "user*" is matched literally. Use a permission profile, or list the exact role names. This will be an error in a future release.',
        );
    });

    it('warns about @roles with regular expressions', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity @roles(readWrite: "/^admin$/") {
                foo: [String]
            }
        `,
            '@roles does not support wildcards or regular expressions; "/^admin$/" is matched literally. Use a permission profile, or list the exact role names. This will be an error in a future release.',
        );
    });

    it('accepts non-nested lists', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity @roles(readWrite: "reader") {
                foo: [String]
            }
        `);
    });
});
