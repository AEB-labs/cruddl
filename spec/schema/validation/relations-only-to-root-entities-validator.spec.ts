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
    RelationsOnlyInRootEntitiesValidator,
    VALIDATION_ERROR_RELATION_IN_NON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/relations-only-in-root-entities-validator";
import {
    RelationsOnlyToRootEntitiesValidator,
    VALIDATION_ERROR_RELATION_TO_NON_ROOT_ENTITY
} from "../../../src/schema/preparation/ast-validation-modules/relations-only-to-root-entities-validator";

const modelWithRelationToNonRoot = `
            type Stuff @childEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `;

const modelWithoutRelationToNonRoot = `
            type Stuff @rootEntity {
                foo: String
            }
            type Bar @rootEntity {
                stuff: [Stuff] @relation
            }
        `;

describe('relations only on root entities validator', () => {
    it('rejects @relation to non-@rootEntity', () => {
        const ast = parse(modelWithRelationToNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyToRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeTruthy();
        expect(validationResult.messages.length).toBe(1);
        expect(validationResult.messages[0].msgKey).toBe(VALIDATION_ERROR_RELATION_TO_NON_ROOT_ENTITY);
    });

    it('accepts @relation to @rootEntity', () => {
        const ast = parse(modelWithoutRelationToNonRoot);
        const validationResult = new ValidationResult(new RelationsOnlyToRootEntitiesValidator().validate(ast));
        expect(validationResult.hasErrors()).toBeFalsy();
    })

});
