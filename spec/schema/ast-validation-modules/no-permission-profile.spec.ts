import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    RootEntitiesWithoutReadRolesValidator,
    VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/root-entities-without-read-roles";
import {
    NoPermissionProfileValidator, VALIDATION_ERROR_NO_PERMISSION_PROFILE
} from '../../../src/schema/preparation/ast-validation-modules/no-permission-profile';
import { DEFAULT_PERMISSION_PROFILE } from '../../../src/schema/schema-defaults';

const modelWithRootEntityWithoutRole = `
            type Stuff @rootEntity {
                foo: [String]
            }
        `;

const modelWithRootEntityWithPermissionProfile = `
            type Stuff @rootEntity(permissionProfile: "test") {
                foo: [String]
            }
        `;

const modelWithRootEntityWithRole = `
            type Stuff @rootEntity @roles {
                foo: [String]
            }
        `;
describe('no-permission-profile validator', () => {
    it('rejects missing @roles', () => {
        const ast = parse(modelWithRootEntityWithoutRole);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {}));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_NO_PERMISSION_PROFILE);
    });

    it('accepts with default permission profile', () => {
        const ast = parse(modelWithRootEntityWithoutRole);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {permissionProfiles:{[DEFAULT_PERMISSION_PROFILE]: {permissions:[]}}}));
        expect(validationResult.hasErrors()).toBeFalsy();
    });

    it('accepts with specified permission profile', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {}));
        expect(validationResult.hasErrors()).toBeFalsy();
    });

    it('accepts with roles', () => {
        const ast = parse(modelWithRootEntityWithRole);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {}));
        expect(validationResult.hasErrors()).toBeFalsy();
    });

});
