import { assertValidatorAccepts, assertValidatorAcceptsAndDoesNotWarn, assertValidatorWarns } from './helpers';

describe('unused object validator', () => {

    it('warns about unused objects', () => {
        assertValidatorWarns(`
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity {
                stuff: Int
            }
        `,
            'Unused object type.');
    });

    it('accepts used objects', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference
            }
        `);
    });

});
