import { expect } from 'chai';
import { assertValidatorAccepts, validate } from './helpers';

const invalidSource = `
            type Test @rootEntity {
                other: Other2
                date: DateTime
            }
            
            type Other @rootEntity {
                field: String2
            }
        `;

const validSource = `
            type Test @rootEntity {
                other: Other @reference
                date: DateTime
            }
            
            type Other @rootEntity {
                field: String @key
            }
        `;

describe('undefined-types validator', () => {

    it('points out missing types', () => {
        const validationResult = validate(invalidSource);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(2);
        expect(validationResult.messages[0].message).to.equal('Type "Other2" not found.');
        expect(validationResult.messages[1].message).to.equal('Type "String2" not found.');
    });

    it('accepts valid sources', () => {
        assertValidatorAccepts(validSource);
    });

});
