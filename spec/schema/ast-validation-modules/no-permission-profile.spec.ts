import { ValidationResult } from '../../../src/model/validation';
import { parse } from 'graphql';
import {
    NoPermissionProfileValidator, VALIDATION_ERROR_NO_PERMISSION_PROFILE
} from '../../../src/schema/preparation/ast-validation-modules/no-permission-profile';
import { DEFAULT_PERMISSION_PROFILE } from '../../../src/schema/schema-defaults';
import { expect } from 'chai';

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
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_NO_PERMISSION_PROFILE);
    });

    it('accepts with default permission profile', () => {
        const ast = parse(modelWithRootEntityWithoutRole);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {permissionProfiles:{[DEFAULT_PERMISSION_PROFILE]: {name: 'test', permissions:[]}}}));
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('accepts with specified permission profile', () => {
        const ast = parse(modelWithRootEntityWithPermissionProfile);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {}));
        expect(validationResult.hasErrors()).to.be.false;
    });

    it('accepts with roles', () => {
        const ast = parse(modelWithRootEntityWithRole);
        const validationResult = new ValidationResult(new NoPermissionProfileValidator().validate(ast, {}));
        expect(validationResult.hasErrors()).to.be.false;
    });

});
