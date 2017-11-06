import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    KnownFieldDirectivesValidator,
    VALIDATION_ERROR_UNKNOWN_FIELD_DIRECTIVE
} from "../../../src/schema/preparation/ast-validation-modules/known-field-directives-validator";

const modelWithFieldWithInvalidDirective = `
            type Stuff {
                foo: String @unknown
            }
        `;

const modelWithFieldWithValidDirective = `
            type Stuff {
                foo: String @key
            }
        `;

const modelWithFieldWithoutDirective = `
            type Stuff {
                foo: String
            }
        `;

describe('known field directive validator', () => {
    it('rejects unknown field directives', () => {
        const ast = parse(modelWithFieldWithInvalidDirective);
        const validationResult = new ValidationResult(new KnownFieldDirectivesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_UNKNOWN_FIELD_DIRECTIVE);
    });

    it('accepts known field directives', () => {
        const ast = parse(modelWithFieldWithValidDirective);
        const validationResult = new ValidationResult(new KnownFieldDirectivesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
        expect(validationResult.messages.length).toBe(0);
    });

    it('accepts fields without directives', () => {
        const ast = parse(modelWithFieldWithoutDirective);
        const validationResult = new ValidationResult(new KnownFieldDirectivesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
        expect(validationResult.messages.length).toBe(0);
    });
});
