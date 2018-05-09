import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    RolesOnNonRootEntityTypesValidator,
    VALIDATION_ERROR_ROLES_ON_NON_ROOT_ENTITY_TYPE
} from "../../../src/schema/preparation/ast-validation-modules/roles-on-non-root-entity-types";
import { expect } from 'chai';

const modelWithValueObjectWithRoles = `
            type ValueObject @valueObject @roles {
                foo: String
            }
        `;

const modelWithEntityExtensionWithRoles = `
            type ValueObject @entityExtension @roles {
                foo: String
            }
        `;

const modelWithRootEntityWithRoles = `
            type ValueObject @rootEntity @roles {
                foo: String
            }
        `;

const modelWithoutValueObjectWithRoles = `
            type ValueObject @valueObject {
                foo: String
            }
        `;

describe('roles-on-non-root-entity-types validator', () => {
    it('rejects value objects with @roles', () => {
        const ast = parse(modelWithValueObjectWithRoles);
        const validationResult = new ValidationResult(new RolesOnNonRootEntityTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_ROLES_ON_NON_ROOT_ENTITY_TYPE);
    });

    it('rejects value objects with fields with @roles', () => {
        const ast = parse(modelWithEntityExtensionWithRoles);
        const validationResult = new ValidationResult(new RolesOnNonRootEntityTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_ROLES_ON_NON_ROOT_ENTITY_TYPE);
    });

    it('accepts value objects without roles', () => {
        const ast = parse(modelWithoutValueObjectWithRoles);
        const validationResult = new ValidationResult(new RolesOnNonRootEntityTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    })

    it('accepts root entities with roles', () => {
        const ast = parse(modelWithRootEntityWithRoles);
        const validationResult = new ValidationResult(new RolesOnNonRootEntityTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    })

});
