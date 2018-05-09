import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";

import { NonUniqueFieldsValidator } from '../../../src/schema/preparation/ast-validation-modules/non-unique-fields-validator';

const modelWithNonUniqueFields = `
            type Stuff @rootEntity {
                foo: String @key
                foo: String 
            }
        `;

const modelWithUniqueFields = `
            type Stuff @rootEntity {
                foo: String
                bar: Bar @key
            }
            type Bar {
                count: Int
            }
        `;

describe('unique field validator', () => {
    it('finds non-unique fields', () => {
        const ast = parse(modelWithNonUniqueFields);
        const validationResult = new ValidationResult(new NonUniqueFieldsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(2);
    });

    it('finds no problems', () => {
        const ast = parse(modelWithUniqueFields);
        const validationResult = new ValidationResult(new NonUniqueFieldsValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
        expect(validationResult.messages.length).toBe(0);
    });
});
