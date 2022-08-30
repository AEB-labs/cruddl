import { PermissionProfileConfig } from '../../../src/model';
import { expect } from 'chai';
import { assertValidatorRejects, validate } from './helpers';

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
    const testProfile: PermissionProfileConfig = {
        permissions: [{ roles: ['admin'], access: 'read' }],
    };
    const testProfileWithAccessGroup: PermissionProfileConfig = {
        permissions: [{ roles: ['admin'], access: 'read', restrictToAccessGroups: ['a'] }],
    };

    it('rejects missing permissionProfile', () => {
        assertValidatorRejects(
            modelWithRootEntityWithPermissionProfile,
            'Permission profile "test" not found.',
        );
    });

    it('accepts existing permission profile', () => {
        const validationResult = validate(modelWithRootEntityWithPermissionProfile, {
            permissionProfiles: { test: testProfile },
        });
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('rejects permissionProfile with accessGroup if field is missing', () => {
        const validationResult = validate(modelWithRootEntityWithPermissionProfile, {
            permissionProfiles: { test: testProfileWithAccessGroup },
        });
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(
            'The permission profile "test" uses "restrictToAccessGroups", but this root entity does not have a "accessGroup" field.',
        );
    });

    it('accepts existing permission profile with accessGroup if field exists as string', () => {
        const validationResult = validate(
            modelWithRootEntityWithPermissionProfileAndStringAccessGroup,
            {
                permissionProfiles: { test: testProfileWithAccessGroup },
            },
        );
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('accepts existing permission profile with accessGroup if field exists as enum', () => {
        const validationResult = validate(
            modelWithRootEntityWithPermissionProfileAndEnumAccessGroup,
            {
                permissionProfiles: { test: testProfileWithAccessGroup },
            },
        );
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('rejects existing permission profile with accessGroup if field exists as invalid type', () => {
        const validationResult = validate(
            modelWithRootEntityWithPermissionProfileAndInvalidAccessGroup,
            {
                permissionProfiles: { test: testProfileWithAccessGroup },
            },
        );
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(
            'This field must be of String or enum type to be used as "accessGroup" with the permission profile "test".',
        );
    });
});
