import { expect } from 'chai';
import { validate } from './helpers';

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
        const validationResult = validate(modelWithRootEntityWithoutRole, {permissionProfiles: {}});
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length, validationResult.toString()).to.equal(1);
        expect(validationResult.messages[0].message).to.equal('No permissions specified for root entity "Stuff". Specify "permissionProfile" in @rootEntity, use the @roles directive, or add a permission profile with the name "default".');
    });

    it('accepts with default permission profile', () => {
        const validationResult = validate(modelWithRootEntityWithoutRole);
        expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    });

    it('accepts with specified permission profile', () => {
        const validationResult = validate(modelWithRootEntityWithPermissionProfile, {
            permissionProfiles: {
                test: {
                    permissions: [
                        {
                            access: 'read',
                            roles: ['admin']
                        }
                    ]
                }
            }
        });
        expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    });

    it('accepts with roles', () => {
        const validationResult = validate(modelWithRootEntityWithRole, {permissionProfiles: {}});
        expect(validationResult.hasErrors(), validationResult.toString()).to.be.false;
    });

});
