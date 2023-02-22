import { expect } from 'chai';
import { assertValidatorAcceptsAndDoesNotWarn, validate } from './helpers';

describe('no-permission-profile validator', () => {
    it('rejects @roles and permissionProfile', () => {
        const validationResult = validate(`
            type Stuff @rootEntity(permissionProfile: "default") @roles {
                foo: [String]
            }
        `);
        expect(validationResult.getErrors()).to.have.lengthOf(2);
        expect(validationResult.getErrors()[0].message).to.equal(
            'Permission profile and explicit role specifiers cannot be combined.',
        );
        expect(validationResult.getErrors()[1].message).to.equal(
            'Permission profile and explicit role specifiers cannot be combined.',
        );
    });

    it('accepts @roles', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity @roles(readWrite: "abc") {
                foo: [String]
            }
        `);
    });

    it('accepts permissionProfile', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity(permissionProfile: "default") {
                foo: [String]
            }
        `);
    });
});
