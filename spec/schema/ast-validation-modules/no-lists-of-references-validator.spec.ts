import {ValidationResult} from "../../../src/model/validation/result";
import {parse} from "graphql";
import {
    NoListOfReferencesValidator,
    VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED
} from "../../../src/schema/preparation/ast-validation-modules/no-list-of-references-validator";
import { expect } from 'chai';

const modelWithListOfReferences = `
            type Stuff @rootEntity {
                foo: String
            }
            type RefStuff {
                stuff: [Stuff] @reference
            }
        `;

const modelWithoutListOfReferences = `
            type Stuff @rootEntity {
                foo: String
            }
            type RefStuff {
                stuff: Stuff @reference
            }
        `;

describe('no lists of references validator', () => {
    it('rejects lists of references', () => {
        const ast = parse(modelWithListOfReferences);
        const validationResult = new ValidationResult(new NoListOfReferencesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED);
    });

    it('accepts non-list references', () => {
        const ast = parse(modelWithoutListOfReferences);
        const validationResult = new ValidationResult(new NoListOfReferencesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    })

});
