import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

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
        assertValidatorAccepts(`
            type ValueObject @valueObject {
                foo: String
            }
        `);
    });

    it('accepts root entities with roles', () => {
        assertValidatorAccepts(`
            type ValueObject @rootEntity @roles {
                foo: String
            }
        `);
    });
});
