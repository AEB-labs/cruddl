import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

describe('roles-on-non-root-entity-types validator', () => {
    it('rejects value objects with @roles', () => {
        assertValidatorRejects(
            `
            type ValueObject @valueObject @roles {
                foo: String
            }
        `,
            '@roles is only allowed on fields and on root entity types.',
        );
    });

    it('rejects entity extensions with @roles', () => {
        assertValidatorRejects(
            `
            type ValueObject @entityExtension @roles {
                foo: String
            }
        `,
            '@roles is only allowed on fields and on root entity types.',
        );
    });

    it('accepts value objects without roles', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type ValueObject @valueObject {
                foo: String
            }
            type Root @rootEntity { bar: ValueObject } # to avoid warning because ValueObject is not used
        `);
    });

    it('accepts root entities with roles', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type ValueObject @rootEntity @roles(readWrite: "abc") {
                foo: String
            }
        `);
    });
});
