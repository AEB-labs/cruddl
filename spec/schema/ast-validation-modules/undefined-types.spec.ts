import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import { expect } from 'chai';
import {
    UndefinedTypesValidator, VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE
} from '../../../src/schema/preparation/ast-validation-modules/undefined-types';

const validSource = `
            type Test {
                other: Other
                date: DateTime
            }
            
            type Other {
                field: String
            }
        `;

const invalidSource = `
            type Test {
                other: Other2
                date: DateTime
            }
            
            type Other {
                field: String2
            }
        `;

describe('undefined-types validator', () => {
    const validator = new UndefinedTypesValidator();

    it('points out missing types', () => {
        const ast = parse(invalidSource);
        const validationResult = new ValidationResult(validator.validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(2);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE);
        expect(validationResult.messages[1].message).to.equal(VALIDATION_ERROR_UNDEFINED_TYPE_REFERENCE);
    });

    it('accepts valid sources', () => {
        const ast = parse(validSource);
        const validationResult = new ValidationResult(validator.validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    });
});
