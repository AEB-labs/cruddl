import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    NoListOfReferencesValidator,
    VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED
} from "../../../src/schema/preparation/ast-validation-modules/no-list-of-references-validator";

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
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED);
    });

    it('accepts non-list references', () => {
        const ast = parse(modelWithoutListOfReferences);
        const validationResult = new ValidationResult(new NoListOfReferencesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
