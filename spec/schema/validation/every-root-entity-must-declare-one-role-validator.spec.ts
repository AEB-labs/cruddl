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

const modelWithRootEntityWithoutRole = `
            type Stuff @rootEntity {
                foo: [String]
            }
        `;

const modelWithRootEntityWithBadRole = `
            type Stuff @rootEntity @roles {
                foo: [String]
            }
        `;

const modelWithRootEntityWithEmptyRole = `
            type Stuff @rootEntity @roles(read: "") {
                foo: [String]
            }
        `;

const modelWithRootEntityWithCorrectRole = `
            type Stuff @rootEntity @roles(readWrite: "reader") {
                foo: [String]
            }
        `;

describe('every root entity must declare one role validator', () => {
    it('rejects missing @roles', () => {
        const ast = parse(modelWithRootEntityWithoutRole);
        const validationResult = new ValidationResult(new EveryRootEntityMustDeclareOneRoleValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY);
    });

    it('rejects @roles without read or readWrite', () => {
        const ast = parse(modelWithRootEntityWithBadRole);
        const validationResult = new ValidationResult(new EveryRootEntityMustDeclareOneRoleValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY);
    });

    it('rejects @roles with empty roles', () => {
        const ast = parse(modelWithRootEntityWithEmptyRole);
        const validationResult = new ValidationResult(new EveryRootEntityMustDeclareOneRoleValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_MISSING_ROLE_ON_ROOT_ENTITY);
    });

    it('accepts non-nested lists', () => {
        const ast = parse(modelWithRootEntityWithCorrectRole);
        const validationResult = new ValidationResult(new EveryRootEntityMustDeclareOneRoleValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
