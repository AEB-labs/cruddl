import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    RootEntitiesWithoutReadRolesValidator,
    VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/root-entities-without-read-roles";
import { expect } from 'chai';

const modelWithRootEntityWithBadRole = `
            type Stuff @rootEntity @roles {
                foo: [String]
            }
        `;

const modelWithRootEntityWithEmptyRole = `
            type Stuff @rootEntity @roles(read: "") {
                foo: [String]
            }
        `;

const modelWithRootEntityWithCorrectRole = `
            type Stuff @rootEntity @roles(readWrite: "reader") {
                foo: [String]
            }
        `;

describe('root-entities-without-read-roles validator', () => {
    it('rejects @roles without read or readWrite', () => {
        const ast = parse(modelWithRootEntityWithBadRole);
        const validationResult = new ValidationResult(new RootEntitiesWithoutReadRolesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
        expect(validationResult.hasWarnings()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY);
    });

    it('rejects @roles with empty roles', () => {
        const ast = parse(modelWithRootEntityWithEmptyRole);
        const validationResult = new ValidationResult(new RootEntitiesWithoutReadRolesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
        expect(validationResult.hasWarnings()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_WARNING_MISSING_ROLE_ON_ROOT_ENTITY);
    });

    it('accepts non-nested lists', () => {
        const ast = parse(modelWithRootEntityWithCorrectRole);
        const validationResult = new ValidationResult(new RootEntitiesWithoutReadRolesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
        expect(validationResult.hasWarnings()).to.be.false;
    })

});
