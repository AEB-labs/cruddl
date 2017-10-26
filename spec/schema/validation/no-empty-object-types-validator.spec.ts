import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {NoDuplicateTypesValidator} from "../../../src/schema/preparation/ast-validation-modules/no-duplicate-types-validator";
import {
    NoEmptyObjectTypesValidator,
    VALIDATION_WARNING_OBJECT_TYPE_WITHOUT_FIELDS
} from "../../../src/schema/preparation/ast-validation-modules/no-empty-object-types-validator";

const modelWithObjectTypeWithFields = `
            type Stuff {
                foo: String
            }
        `;

const modelWithObjectTypeWithoutFields = `
            type Stuff {
            }
        `;

describe('no empty object types validator', () => {
    it('finds object types without fields', () => {
        const ast = parse(modelWithObjectTypeWithoutFields);
        const validationResult = new ValidationResult(new NoEmptyObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_WARNING_OBJECT_TYPE_WITHOUT_FIELDS);
    });

    it('accepts object types with fields', () => {
        const ast = parse(modelWithObjectTypeWithFields);
        const validationResult = new ValidationResult(new NoEmptyObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).toBeFalsy();
    })

});
