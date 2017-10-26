import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName
} from "../../schema-utils";
import {KEY_FIELD_DIRECTIVE, REFERENCE_DIRECTIVE, ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";
import {OBJECT_TYPE_DEFINITION} from "graphql/language/kinds";

export const VALIDATION_ERROR_REFERENCE_TO_NON_ROOT_ENTITY = '@reference is only allowed to @rootEntity.';
export const VALIDATION_ERROR_REFERENCE_TO_OBJECT_WITHOUT_KEY_FIELD = '@referenced @rootEntity has no @key field.';

export class ReferenceOnlyToRootEntitiesWithKeyFieldValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            if (field.directives && field.directives.some(directive => directive.name.value === REFERENCE_DIRECTIVE)) {
                const namedTypeDefinition = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type));
                if (!namedTypeDefinition || namedTypeDefinition.kind !== OBJECT_TYPE_DEFINITION) {
                    // catch somewhere else
                    return;
                }
                if (!hasDirectiveWithName(namedTypeDefinition, ROOT_ENTITY_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_REFERENCE_TO_NON_ROOT_ENTITY, {}, field.loc))
                }
                if (!namedTypeDefinition.fields.some(field => hasDirectiveWithName(field, KEY_FIELD_DIRECTIVE))) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_REFERENCE_TO_OBJECT_WITHOUT_KEY_FIELD, { rootEntity: namedTypeDefinition.name.value }, field.loc))
                }
            }
        }));
        return validationMessages;
    }

}