import {validateModel, ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    OnlyAllowedTypesValidator,
    VALIDATION_ERROR_INVALID_TYPE_KIND
} from "../../../src/schema/preparation/ast-validation-modules/only-allowed-types-validator";
import {
    ObjectTypeDirectiveCountValidator,
    VALIDATION_ERROR_INVALID_COUNT_OF_ENTITY_DIRECTIVES
} from "../../../src/schema/preparation/ast-validation-modules/object-type-directive-count-validator";
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
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED);
    });

    it('accepts non-list references', () => {
        const ast = parse(modelWithoutListOfReferences);
        const validationResult = new ValidationResult(new NoListOfReferencesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
