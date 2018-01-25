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
import {
    RolesAndPermissionProfileCombinedValidator, VALIDATION_ERROR_ROLES_AND_PERMISSION_PROFILE_COMBINED
} from '../../../src/schema/preparation/ast-validation-modules/roles-and-permission-profile-combined';

const modelWithRootEntityWithPermissionProfile = `
            type Stuff @rootEntity(permissionProfile: "test") {
                foo: [String]
            }
        `;

const modelWithRootEntityWithRolesAndPermissionProfile = `
            type Stuff @rootEntity(permissionProfile: "test") @roles {
                foo: [String]
            }
        `;

const modelWithRootEntityWithRole = `
            type Stuff @rootEntity @roles {
                foo: [String]
            }
        `;
describe('no-permission-profile validator', () => {
    it('rejects @roles and permissionProfile', () => {
        const ast = parse(modelWithRootEntityWithRolesAndPermissionProfile);
        const validationResult = new ValidationResult(new RolesAndPermissionProfileCombinedValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_ROLES_AND_PERMISSION_PROFILE_COMBINED);
    });

    it('accepts @roles', () => {
        const ast = parse(modelWithRootEntityWithRole);
        const validationResult = new ValidationResult(new RolesAndPermissionProfileCombinedValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    });

    it('accepts permissionProfile', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new RolesAndPermissionProfileCombinedValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    });

});
