import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    NoUnusedNonRootObjectTypesValidator,
    VALIDATION_WARNING_UNUSED_OBJECT_TYPE
} from "../../../src/schema/preparation/ast-validation-modules/no-unused-non-root-object-types-validator";

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
        expect(validationResult.hasWarnings()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_WARNING_UNUSED_OBJECT_TYPE);
    });
    it('accepts non-list references', () => {
        const ast = parse(modelWithoutUnusedEntities);
        const validationResult = new ValidationResult(new NoUnusedNonRootObjectTypesValidator().validate(ast));
        expect(validationResult.hasWarnings()).toBeFalsy();
    })

});
