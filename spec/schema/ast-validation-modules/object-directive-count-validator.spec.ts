import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    ObjectTypeDirectiveCountValidator,
    VALIDATION_ERROR_INVALID_COUNT_OF_ENTITY_DIRECTIVES
} from "../../../src/schema/preparation/ast-validation-modules/object-type-directive-count-validator";

const modelWithTypeWithoutDirective = `
            type Stuff {
                foo: String
            }
        `;

const modelWithTypeWithToManyDirectives = `
            type Stuff @rootEntity @valueObject {
                foo: String
            }
        `;

const modelWithoutDirectiveFlaws = `
            enum Bla {
                one
                two
            }

            type Stuff @rootEntity {
                foo: String
                children: [Child]
                ext: Extension
                value: Value 
            }
            type Child @childEntity {
                name: String
            }
            
            type Value @valueObject {
                number: Int    
            }
            
            type Extension @entityExtension {
                number2: Int
            }
        `;

describe('object directive count validator', () => {
    it('finds types without directive', () => {
        const ast = parse(modelWithTypeWithoutDirective);
        const validationResult = new ValidationResult(new ObjectTypeDirectiveCountValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_INVALID_COUNT_OF_ENTITY_DIRECTIVES);
    });

    it('finds types with too many directive', () => {
        const ast = parse(modelWithTypeWithToManyDirectives);
        const validationResult = new ValidationResult(new ObjectTypeDirectiveCountValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_INVALID_COUNT_OF_ENTITY_DIRECTIVES);
    });

    it('accepts correct type directives', () => {
        const ast = parse(modelWithoutDirectiveFlaws);
        const validationResult = new ValidationResult(new ObjectTypeDirectiveCountValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
