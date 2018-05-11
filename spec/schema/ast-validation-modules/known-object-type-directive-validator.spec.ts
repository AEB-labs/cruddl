import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    KnownObjectTypeDirectivesValidator,
    VALIDATION_ERROR_UNKNOWN_OBJECT_TYPE_DIRECTIVE
} from "../../../src/schema/preparation/ast-validation-modules/known-object-type-directives-validator";
import { expect } from 'chai';

const modelWithObjectTypeWithInvalidDirective = `
            type Stuff @invalid {
                foo: String
            }
        `;

const modelWithObjectTypeWithValidDirective = `
            type Stuff @rootEntity {
                foo: String
            }
        `;

const modelWithObjectTypeWithoutDirective = `
            type Stuff {
                foo: String
            }
        `;

describe('known object type directive validator', () => {
    it('rejects unknown object type directives', () => {
        const ast = parse(modelWithObjectTypeWithInvalidDirective);
        const validationResult = new ValidationResult(new KnownObjectTypeDirectivesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_UNKNOWN_OBJECT_TYPE_DIRECTIVE);
    });

    it('accepts known object type directives', () => {
        const ast = parse(modelWithObjectTypeWithValidDirective);
        const validationResult = new ValidationResult(new KnownObjectTypeDirectivesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
        expect(validationResult.messages.length).to.equal(0);
    });

    it('accepts object types without directives', () => {
        const ast = parse(modelWithObjectTypeWithoutDirective);
        const validationResult = new ValidationResult(new KnownObjectTypeDirectivesValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
        expect(validationResult.messages.length).to.equal(0);
    });
});
