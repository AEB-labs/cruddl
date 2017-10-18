import {validateModel, ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {NoDuplicateTypesValidator} from "../../../src/schema/preparation/ast-validation-modules/no-duplicate-types-validator";

const modelWithoutDuplicates = `
            type Stuff {
                foo: String
            }
        `;

const modelWithDuplicate = `
            type Stuff {
                foo: String
            }
            type Stuff {
                name: String
            }
        `;

describe('no duplicate type definition validator', () => {
    it('finds duplicate types', () => {
        const ast = parse(modelWithDuplicate);
        const validationResult = new ValidationResult(new NoDuplicateTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
    });

    it('ignores unique types', () => {
        const ast = parse(modelWithoutDuplicates);
        const validationResult = new ValidationResult(new NoDuplicateTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
