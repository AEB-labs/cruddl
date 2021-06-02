import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

describe('known field directive validator', () => {
    it('rejects unknown field directives', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                foo: String @unknown
            }
        `,
            'Unknown directive "@unknown".'
        );
    });

    it('accepts known field directives', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String @key
            }
        `);
    });

    it('accepts fields without directives', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    });
});
