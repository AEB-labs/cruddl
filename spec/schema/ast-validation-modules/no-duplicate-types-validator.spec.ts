import { expect } from 'chai';
import { assertValidatorAcceptsAndDoesNotWarn, validate } from './helpers';

describe('no duplicate type definition validator', () => {
    it('finds duplicate types', () => {
        const validationResult = validate(`
            type Stuff @rootEntity {
                foo: String
            }
            type Stuff {
                bar: String
            }
        `);
        expect(validationResult.hasErrors()).to.be.true;
        // error 1: second definition does not have @rootEntity/@childEntity etc.
        // error 2+3: duplicate type
        // error 4: warning about not used
        // didn't specify @rootEntity on the second type because that would trigger a graphql error that's evaluated
        // earlier about duplicate @rootEntity directives
        expect(validationResult.messages.length).to.equal(4);
        expect(validationResult.messages[1].message).to.equal('Duplicate type name: "Stuff".');
    });

    it('accepts unique types', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String
            }
        `);
    });
});
