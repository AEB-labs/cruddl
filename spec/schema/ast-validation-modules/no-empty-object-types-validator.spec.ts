import { ValidationResult } from '../../../src/schema/preparation/ast-validator';
import { parse } from 'graphql';
import {
    NoEmptyObjectTypesValidator, VALIDATION_ERROR_OBJECT_TYPE_WITHOUT_FIELDS
} from '../../../src/schema/preparation/ast-validation-modules/no-empty-object-types-validator';

const modelWithObjectTypeWithFields = `
            type Stuff {
                foo: String
            }
        `;

const modelWithRootEntityWithoutFields = `
            type Stuff @rootEntity {
            }
        `;

const modelWithValueObjectsWithoutFields = `
            type Stuff @valueObject {
            }
        `;

describe('no empty object types validator', () => {
    function isSyntaxError() {
        // If this is already a syntax error (as it is in graphql 0.12), don't test this
        try {
            parse(`type Test { }`);
            return false;
        } catch {
            return true;
        }
    }

    it('rejects rootEntities without fields', () => {
        if (isSyntaxError()) {
            return;
        }
        const ast = parse(modelWithRootEntityWithoutFields);
        const validationResult = new ValidationResult(new NoEmptyObjectTypesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_OBJECT_TYPE_WITHOUT_FIELDS);
    });

    it('rejects valueObjects without fields', () => {
        if (isSyntaxError()) {
            return;
        }
        const ast = parse(modelWithValueObjectsWithoutFields);
        const validationResult = new ValidationResult(new NoEmptyObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).toBeFalsy();
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe(VALIDATION_ERROR_OBJECT_TYPE_WITHOUT_FIELDS);
    });

    it('accepts object types with fields', () => {
        const ast = parse(modelWithObjectTypeWithFields);
        const validationResult = new ValidationResult(new NoEmptyObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).toBeFalsy();
    })

});
