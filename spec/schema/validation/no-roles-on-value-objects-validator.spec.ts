import {validateModel, ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    OnlyAllowedTypesValidator,
    VALIDATION_ERROR_INVALID_TYPE_KIND
} from "../../../src/schema/preparation/ast-validation-modules/only-allowed-types-validator";
import {
    NoListsOfListsValidator,
    VALIDATION_ERROR_LISTS_OF_LISTS_NOT_ALLOWED
} from "../../../src/schema/preparation/ast-validation-modules/no-lists-of-lists-validator";
import {
    EveryRootEntityMustDeclareOneRoleValidator,
    VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/every-root-entity-must-declare-one-role-validator";
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
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS);
    });

    it('rejects value objects with fields with @roles', () => {
        const ast = parse(modelWithValueObjectWithFieldWithRoles);
        const validationResult = new ValidationResult(new NoRolesOnValueObjectsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_ROLES_NOT_ALLOWED_FOR_VALUE_OBJECTS);
    });

    it('accepts value objects without roles', () => {
        const ast = parse(modelWithoutValueObjectWithRoles);
        const validationResult = new ValidationResult(new NoRolesOnValueObjectsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
