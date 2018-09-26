import { expect } from 'chai';
import { validate } from './helpers';

const modelWithoutForbiddenTypes = `
            type Stuff @rootEntity {
                foo: String
            }
        `;

const modelWithForbiddenTypes = `
            type Stuff @rootEntity {
                foo: String
            }
            input ForbiddenStuff {
                name: String
            }
        `;

describe('only allowed type definition validator', () => {

    it('finds invalid type kinds', () => {
        const validationResult = validate(modelWithForbiddenTypes);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal('This kind of definition is not allowed. Only object and enum type definitions are allowed.');
    });

    it('accepts correct type kinds', () => {
        const validationResult = validate(modelWithoutForbiddenTypes);
        expect(validationResult.hasErrors()).to.be.false;
    })

});
