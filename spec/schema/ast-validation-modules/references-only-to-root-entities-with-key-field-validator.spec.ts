import {ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    ReferenceOnlyToRootEntitiesWithKeyFieldValidator,
} from "../../../src/schema/preparation/ast-validation-modules/references-only-to-root-entities-with-key-field-validator";

const modelWithReferenceToNonRoot = `
            type Stuff @childEntity {
                foo: String @key
            }
            type Bar @rootEntity {
                stuff: Stuff @reference
            }
        `;

const modelWithReferenceToRootWithoutKeyField = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: Stuff @reference
            }
        `;

const modelWithoutReferenceToNonRoot = `
            type Stuff @rootEntity {
                foo: String @key
            }
            type Bar @rootEntity {
                stuff: Stuff @reference
            }
        `;

describe('references only on root entity with key field validator', () => {
    it('rejects @reference to non-@rootEntity', () => {
        const ast = parse(modelWithReferenceToNonRoot);
        const validationResult = new ValidationResult(new ReferenceOnlyToRootEntitiesWithKeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe('"Stuff" is not a root entity');
    });

    it('rejects @reference to rootEntity without @key', () => {
        const ast = parse(modelWithReferenceToRootWithoutKeyField);
        const validationResult = new ValidationResult(new ReferenceOnlyToRootEntitiesWithKeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].message).toBe('"Stuff" has no @key field');
    });

    it('accepts @reference to @rootEntity with @key', () => {
        const ast = parse(modelWithoutReferenceToNonRoot);
        const validationResult = new ValidationResult(new ReferenceOnlyToRootEntitiesWithKeyFieldValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
