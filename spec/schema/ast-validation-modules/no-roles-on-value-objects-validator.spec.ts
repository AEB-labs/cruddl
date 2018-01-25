import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    NoRolesOnValueObjectsValidator,
    VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS
} from "../../../src/schema/preparation/ast-validation-modules/no-roles-on-value-objects-validator";

const modelWithValueObjectWithRoles = `
            type ValueObject @valueObject @roles {
                foo: String
            }
        `;

const modelWithValueObjectWithFieldWithRoles = `
            type ValueObject @valueObject {
                foo: String @roles
            }
        `;

const modelWithoutValueObjectWithRoles = `
            type ValueObject @valueObject {
                foo: String
            }
        `;

describe('no roles on value objects validator', () => {
    it('rejects value objects with @roles', () => {
        const ast = parse(modelWithValueObjectWithRoles);
        const validationResult = new ValidationResult(new NoRolesOnValueObjectsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS);
    });

    it('rejects value objects with fields with @roles', () => {
        const ast = parse(modelWithValueObjectWithFieldWithRoles);
        const validationResult = new ValidationResult(new NoRolesOnValueObjectsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS);
    });

    it('accepts value objects without roles', () => {
        const ast = parse(modelWithoutValueObjectWithRoles);
        const validationResult = new ValidationResult(new NoRolesOnValueObjectsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
