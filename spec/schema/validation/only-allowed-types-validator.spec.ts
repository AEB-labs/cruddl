import {validateModel, ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {OnlyAllowedTypesValidator} from "../../../src/schema/preparation/ast-validation-modules/only-allowed-types-validator";

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
    it('blames invalid type kinds', () => {
        const ast = parse(modelWithForbiddenTypes);
        const validationResult = new ValidationResult(new OnlyAllowedTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
    });

    it('ignores good type kinds', () => {
        const ast = parse(modelWithoutForbiddenTypes);
        const validationResult = new ValidationResult(new OnlyAllowedTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
