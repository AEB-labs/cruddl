import { expect } from 'chai';
import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';

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
        assertValidatorAccepts(`
            type Stuff @rootEntity @roles {
                foo: [String]
            }
        `);
    });

    it('accepts permissionProfile', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity(permissionProfile: "default") {
                foo: [String]
            }
        `);
    });
});
