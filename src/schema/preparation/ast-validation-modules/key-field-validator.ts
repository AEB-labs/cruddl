import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../../../model/validation/message";
import {LIST_TYPE, NON_NULL_TYPE, SCALAR_TYPE_DEFINITION} from "../../../graphql/kinds";
import {getNamedTypeDefinitionAST, getObjectTypes, getTypeNameIgnoringNonNullAndList} from "../../schema-utils";
import {KEY_FIELD_DIRECTIVE, ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";

export const VALIDATION_ERROR_INVALID_KEY_FIELD_TYPE = "Fields annotated with @key must be of a scalar type.";
export const VALIDATION_ERROR_INVALID_KEY_FIELD_LIST_TYPE = "Fields annotated with @key must not be a list.";
export const VALIDATION_ERROR_DUPLICATE_KEY_FIELD = "Only one field can be a @key field.";
export const VALIDATION_ERROR_INVALID_OBJECT_TYPE = "A @key field can only be declared on root entities.";

export class KeyFieldValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectTypeDefinition => {
            let counter = 0;
            const keyFields = objectTypeDefinition.fields.filter(field => field.directives != undefined && field.directives.some(directive => directive.name.value === KEY_FIELD_DIRECTIVE)).forEach(keyField => {
                counter++;
                if (objectTypeDefinition.directives != undefined && !objectTypeDefinition.directives.some(directive => directive.name.value === ROOT_ENTITY_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_OBJECT_TYPE, {type: objectTypeDefinition.name.value}, keyField.loc));
                }
                if (counter > 1) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_DUPLICATE_KEY_FIELD, {type: objectTypeDefinition.name.value}, keyField.loc));
                    return;
                }
                if (keyField.type.kind === LIST_TYPE || keyField.type.kind === NON_NULL_TYPE && keyField.type.type.kind === LIST_TYPE) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_KEY_FIELD_LIST_TYPE, {type: objectTypeDefinition.name.value}, keyField.loc))
                    return;
                }
                const namedType = getTypeNameIgnoringNonNullAndList(keyField.type);
                const referencedType = getNamedTypeDefinitionAST(ast, namedType);
                if (referencedType.kind !== SCALAR_TYPE_DEFINITION) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_INVALID_KEY_FIELD_TYPE, {type: objectTypeDefinition.name.value}, keyField.loc))
                }
            })
        });
        return validationMessages;
    }
}
