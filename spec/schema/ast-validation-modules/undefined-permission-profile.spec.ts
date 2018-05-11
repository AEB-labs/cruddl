import { parse } from 'graphql';
import {
    UndefinedPermissionProfileValidator, VALIDATION_ERROR_ACCESS_GROUP_FIELD_MISSING,
    VALIDATION_ERROR_ACCESS_GROUP_FIELD_WRONG_TYPE, VALIDATION_ERROR_UNDEFINED_PERMISSION_PROFILE
} from '../../../src/schema/preparation/ast-validation-modules/undefined-permission-profile';
import { PermissionProfile } from '../../../src/authorization/permission-profile';
import { expect } from 'chai';
import { ValidationResult } from '../../../src/model/validation';

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
    const testProfile = new PermissionProfile('test', { permissions: [ { roles: [ "admin" ], access: "read" }] });
    const testProfileWithAccessGroup = new PermissionProfile('test', { permissions: [ { roles: [ "admin" ], access: "read", restrictToAccessGroups: ["a"] }] });

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
