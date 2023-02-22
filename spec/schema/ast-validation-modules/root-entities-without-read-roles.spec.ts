import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorWarns } from './helpers';

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

    it('accepts non-nested lists', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity @roles(readWrite: "reader") {
                foo: [String]
            }
        `);
    });
});
