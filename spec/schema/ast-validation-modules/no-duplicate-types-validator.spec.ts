import { expect } from 'chai';
import { assertValidatorAccepts, validate } from './helpers';

describe('no duplicate type definition validator', () => {
    it('finds duplicate types', () => {
        const validationResult = validate(`
            type Stuff @rootEntity {
                foo: String
            }
            type Stuff @rootEntity {
                bar: String
            }
            type Stuff @rootEntity {
                name: String
            }
        `);
        expect(validationResult.hasErrors()).to.be.true;
        // we expect two errors because both types have a duplicate type error
        expect(validationResult.messages.length).to.equal(3);
        expect(validationResult.messages[0].message).to.equal('Duplicate type name: "Stuff".');
    });

    it('accepts unique types', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    })

});
