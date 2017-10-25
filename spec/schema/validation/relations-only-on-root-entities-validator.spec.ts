import {validateModel, ValidationResult} from "../../../src/schema/preparation/ast-validator";
import {parse} from "graphql";
import {
    OnlyAllowedTypesValidator,
    VALIDATION_ERROR_INVALID_TYPE_KIND
} from "../../../src/schema/preparation/ast-validation-modules/only-allowed-types-validator";
import {
    ObjectTypeDirectiveCountValidator,
    VALIDATION_ERROR_INVALID_COUNT_OF_ENTITY_DIRECTIVES
} from "../../../src/schema/preparation/ast-validation-modules/object-type-directive-count-validator";
import {
    NoListOfReferencesValidator,
    VALIDATION_ERROR_LIST_OF_REFERENCES_NOT_SUPPORTED
} from "../../../src/schema/preparation/ast-validation-modules/no-list-of-references-validator";
import {
    RelationsOnlyOnRootEntitiesValidator,
    VALIDATION_ERROR_RELATION_ON_NON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/relations-only-on-root-entities-validator";

const modelWithRelationInNonRoot = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @childEntity {
                stuff: [Stuff] @relation
            }
        `;

const modelWithoutRelationInNonRoot = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `;

describe('relations only on root entities validator', () => {
    it('rejects @relation in non-@rootEntity', () => {
        const ast = parse(modelWithRelationInNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyOnRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_RELATION_ON_NON_ROOT_ENTITY);
    });

    it('accepts @relation in @rootEntity', () => {
        const ast = parse(modelWithoutRelationInNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyOnRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
