import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import { expect } from 'chai';

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
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_ROLES_AND_PERMISSION_PROFILE_COMBINED);
    });

    it('accepts @roles', () => {
        const ast = parse(modelWithRootEntityWithRole);
        const validationResult = new ValidationResult(new RolesAndPermissionProfileCombinedValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('accepts permissionProfile', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new RolesAndPermissionProfileCombinedValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    });

});
