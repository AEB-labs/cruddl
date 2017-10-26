import {ASTValidator} from "../ast-validator";
import {DocumentNode} from "graphql";
import {ValidationMessage} from "../validation-message";
import {
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName
} from "../../schema-utils";
import {RELATION_DIRECTIVE, ROOT_ENTITY_DIRECTIVE} from "../../schema-defaults";
import {OBJECT_TYPE_DEFINITION} from "graphql/language/kinds";

export const VALIDATION_ERROR_RELATION_TO_NON_ROOT_ENTITY = '@relation is only allowed to @rootEntity.';

export class RelationsOnlyToRootEntitiesValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        const validationMessages: ValidationMessage[] = [];
        getObjectTypes(ast).forEach(objectType => objectType.fields.forEach(field => {
            if (field.directives && field.directives.some(directive => directive.name.value === RELATION_DIRECTIVE)) {
                const namedTypeDefinition = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(field.type));
                if (!namedTypeDefinition || namedTypeDefinition.kind !== OBJECT_TYPE_DEFINITION) {
                    // catch somewhere else
                    return;
                }
                if (!hasDirectiveWithName(namedTypeDefinition, ROOT_ENTITY_DIRECTIVE)) {
                    validationMessages.push(ValidationMessage.error(VALIDATION_ERROR_RELATION_TO_NON_ROOT_ENTITY, {}, field.loc))
                }
            }
        }));
        return validationMessages;
    }

}