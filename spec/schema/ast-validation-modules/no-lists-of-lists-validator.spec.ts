import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    NoListsOfListsValidator,
    VALIDATION_ERROR_LISTS_OF_LISTS_NOT_ALLOWED
} from "../../../src/schema/preparation/ast-validation-modules/no-lists-of-lists-validator";
import { expect } from 'chai';

const modelWithListOfLists = `
            type Stuff {
                foo: [[String]]
            }
        `;

const modelWithNonNullableListOfNonNullableLists = `
            type Stuff {
                foo: [[String!]!]!
            }
        `;

const modelWithoutListofLists = `
            type Stuff {
                foo: [String!]!
            }
        `;

describe('no lists of lists validator', () => {
    it('rejects lists of lists', () => {
        const ast = parse(modelWithListOfLists);
        const validationResult = new ValidationResult(new NoListsOfListsValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_LISTS_OF_LISTS_NOT_ALLOWED);
    });

    it('rejects non-nullable lists of non-nullable lists of non-nullable elements', () => {
        const ast = parse(modelWithNonNullableListOfNonNullableLists);
        const validationResult = new ValidationResult(new NoListsOfListsValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_ERROR_LISTS_OF_LISTS_NOT_ALLOWED);
    });

    it('accepts non-nested lists', () => {
        const ast = parse(modelWithoutListofLists);
        const validationResult = new ValidationResult(new NoListsOfListsValidator().validate(ast));
        expect(validationResult.hasErrors()).to.be.false;
    })

});
