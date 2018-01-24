import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {OnlyAllowedTypesValidator} from "../../../src/schema/preparation/ast-validation-modules/only-allowed-types-validator";
import {
    KeyFieldValidator,
    VALIDATION_ERROR_DUPLICATE_KEY_FIELD, VALIDATION_ERROR_INVALID_KEY_FIELD_LIST_TYPE,
    VALIDATION_ERROR_INVALID_KEY_FIELD_TYPE, VALIDATION_ERROR_INVALID_OBJECT_TYPE
} from "../../../src/schema/preparation/ast-validation-modules/key-field-validator";

const modelWithTwoKeyFields = `
            type Stuff @rootEntity {
                foo: String @key
                bar: String @key
            }
        `;

const modelWithInvalidKeyFieldType = `
            type Stuff @rootEntity {
                foo: String
                bar: Bar @key
            }
            type Bar {
                count: Int
            }
        `;

const modelWithInvalidKeyFieldListType = `
            type Stuff @rootEntity {
                foo: String
                bar: [Int] @key
            }
        `;

const modelWithInvalidEntityType = `
            type Stuff @childEntity {
                foo: String @key
            }
        `;

const modelWithCorrectKeyUsage = `
            type Stuff @rootEntity {
                foo: String @key
            }
        `;

describe('key field validator', () => {
    it('finds duplicate key usage', () => {
        const ast = parse(modelWithTwoKeyFields);
        const validationResult = new ValidationResult(new KeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_DUPLICATE_KEY_FIELD);
    });

    it('finds bad type usage', () => {
        const ast = parse(modelWithInvalidKeyFieldType);
        const validationResult = new ValidationResult(new KeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_INVALID_KEY_FIELD_TYPE);
    });

    it('finds bad list type usage', () => {
        const ast = parse(modelWithInvalidKeyFieldListType);
        const validationResult = new ValidationResult(new KeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_INVALID_KEY_FIELD_LIST_TYPE);
    });

    it('finds bad object type usage', () => {
        const ast = parse(modelWithInvalidEntityType);
        const validationResult = new ValidationResult(new KeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_INVALID_OBJECT_TYPE);
    });

    it('accepts correct key usage', () => {
        const ast = parse(modelWithCorrectKeyUsage);
        const validationResult = new ValidationResult(new KeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
        expect(validationResult.messages.length).toBe(0);
    });
});
