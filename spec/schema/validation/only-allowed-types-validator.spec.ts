import {validateModel, ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    OnlyAllowedTypesValidator,
    VALIDATION_ERROR_INVALID_TYPE_KIND
} from "../../../src/schema/preparation/ast-validation-modules/only-allowed-types-validator";

const modelWithoutForbiddenTypes = `
            type Stuff {
                foo: String
            }
        `;

const modelWithForbiddenTypes = `
            type Stuff {
                foo: String
            }
            input ForbiddenStuff {
                name: String
            }
        `;

describe('only allowed type definition validator', () => {
    it('finds invalid type kinds', () => {
        const ast = parse(modelWithForbiddenTypes);
        const validationResult = new ValidationResult(new OnlyAllowedTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_INVALID_TYPE_KIND);
    });

    it('accepts correct type kinds', () => {
        const ast = parse(modelWithoutForbiddenTypes);
        const validationResult = new ValidationResult(new OnlyAllowedTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
