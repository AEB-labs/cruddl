import { expect } from 'chai';
import { assertValidatorAccepts, validate } from './helpers';

const modelWithNonUniqueFields = `
            type Stuff @rootEntity {
                foo: String @key
                foo: String 
            }
        `;

describe('unique field validator', () => {

    it('finds non-unique fields', () => {
        const validationResult = validate(modelWithNonUniqueFields);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(2);
    });

    it('finds no problems', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String @key
                bar: [Bar]
            }
            type Bar @childEntity {
                count: Int
            }
        `);
    });

});
