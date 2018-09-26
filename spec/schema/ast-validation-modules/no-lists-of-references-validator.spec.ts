import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

describe('no lists of references validator', () => {
    it('rejects lists of references', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                foo: String @key
            }
            type RefStuff @rootEntity {
                stuff: [Stuff] @reference
            }
        `,
            '@reference is not supported with list types. Consider wrapping the reference in a child entity or value object type.');
    });

    it('accepts non-list references', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference
            }
        `);
    })

});
