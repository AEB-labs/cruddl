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
import {
    UndefinedPermissionProfileValidator, VALIDATION_ERROR_ACCESS_GROUP_FIELD_MISSING,
    VALIDATION_ERROR_ACCESS_GROUP_FIELD_WRONG_TYPE,
    VALIDATION_ERROR_UNDEFINED_PERMISSION_PROFILE
} from '../../../src/schema/preparation/ast-validation-modules/undefined-permission-profile';
import { Permission, PermissionProfile } from '../../../src/authorization/permission-profile';
import { expect } from 'chai';

const modelWithRootEntityWithPermissionProfile = `
            type Stuff @rootEntity(permissionProfile: "test") {
                foo: [String]
            }
        `;

const modelWithRootEntityWithPermissionProfileAndStringAccessGroup = `
            type Stuff @rootEntity(permissionProfile: "test") {
                foo: [String]
                accessGroup: String
            }
        `;

const modelWithRootEntityWithPermissionProfileAndEnumAccessGroup = `
            type Stuff @rootEntity(permissionProfile: "test") {
                foo: [String]
                accessGroup: AG
            }
            
            enum AG { A, B }
        `;

const modelWithRootEntityWithPermissionProfileAndInvalidAccessGroup = `
            type Stuff @rootEntity(permissionProfile: "test") {
                foo: [String]
                accessGroup: Test
            }
            
            type Test @valueObject {
                field: ID
            }
        `;

describe('undefined-permission-profile validator', () => {
    const testProfile = new PermissionProfile({ permissions: [ { roles: [ "admin" ], access: "read" }] });
    const testProfileWithAccessGroup = new PermissionProfile({ permissions: [ { roles: [ "admin" ], access: "read", restrictToAccessGroups: ["a"] }] });

    it('rejects missing permissionProfile', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new UndefinedPermissionProfileValidator().validate(ast, {}));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_UNDEFINED_PERMISSION_PROFILE);
    });

    it('accepts existing permission profile', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new UndefinedPermissionProfileValidator().validate(ast, {
            permissionProfiles: { test: testProfile }
        }));
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('rejects permissionProfile with accessGroup if field is missing', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new UndefinedPermissionProfileValidator().validate(ast, {
            permissionProfiles: { test: testProfileWithAccessGroup }
        }));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_ACCESS_GROUP_FIELD_MISSING);
    });

    it('accepts existing permission profile with accessGroup if field exists as string', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfileAndStringAccessGroup);
        const validationResult = new ValidationResult(new UndefinedPermissionProfileValidator().validate(ast, {
            permissionProfiles: { test: testProfileWithAccessGroup }
        }));
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('accepts existing permission profile with accessGroup if field exists as enum', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfileAndEnumAccessGroup);
        const validationResult = new ValidationResult(new UndefinedPermissionProfileValidator().validate(ast, {
            permissionProfiles: { test: testProfileWithAccessGroup }
        }));
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('rejects existing permission profile with accessGroup if field exists as invalid type', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfileAndInvalidAccessGroup);
        const validationResult = new ValidationResult(new UndefinedPermissionProfileValidator().validate(ast, {
            permissionProfiles: { test: testProfileWithAccessGroup }
        }));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_ACCESS_GROUP_FIELD_WRONG_TYPE);
    });

});