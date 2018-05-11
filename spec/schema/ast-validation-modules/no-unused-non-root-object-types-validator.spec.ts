import {ValidationResult} from "../../../src/model/validation/result";
import {parse} from "graphql";
import {
    NoUnusedNonRootObjectTypesValidator,
    VALIDATION_WARNING_UNUSED_OBJECT_TYPE
} from "../../../src/schema/preparation/ast-validation-modules/no-unused-non-root-object-types-validator";
import { expect } from 'chai';

const modelWithUnusedChildEntity = `
            type Stuff @rootEntity {
                foo: String
            }
            type Child @childEntity {
                stuff: Int
            }
        `;

const modelWithoutUnusedEntities = `
            type Stuff @rootEntity {
                foo: String
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference
            }
        `;

describe('no lists of references validator', () => {
    it('rejects lists of references', () => {
        const ast = parse(modelWithUnusedChildEntity);
        const validationResult = new ValidationResult(new NoUnusedNonRootObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).to.be.true;
        expect(validationResult.messages.length).to.equal(1);
        expect(validationResult.messages[0].message).to.equal(VALIDATION_WARNING_UNUSED_OBJECT_TYPE);
    });
    it('accepts non-list references', () => {
        const ast = parse(modelWithoutUnusedEntities);
        const validationResult = new ValidationResult(new NoUnusedNonRootObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).to.be.false;
    })

});
