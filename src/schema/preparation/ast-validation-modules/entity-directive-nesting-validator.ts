import {ASTValidator} from "../ast-validator";
import {ValidationMessage} from "../validation-message";
import {DocumentNode, FieldDefinitionNode, Location, ObjectTypeDefinitionNode, TypeNode} from "graphql";
import {
    getNamedTypeDefinitionAST,
    getObjectTypes,
    getTypeNameIgnoringNonNullAndList,
    hasDirectiveWithName
} from "../../schema-utils";
import {flatMap} from "../../../utils/utils";
import {
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE,
    OBJECT_TYPE_ENTITY_DIRECTIVES,
    REFERENCE_DIRECTIVE,
    RELATION_DIRECTIVE,
    ROOT_ENTITY_DIRECTIVE,
    VALUE_OBJECT_DIRECTIVE
} from "../../schema-defaults";
import {LIST_TYPE, NAMED_TYPE, NON_NULL_TYPE, OBJECT_TYPE_DEFINITION} from "../../../graphql/kinds";

export const VALIDATION_ERROR_LISTS_OF_ENTITY_EXTENSIONS_NOT_ALLOWED = 'Entity extensions are not allowed in lists. Use child entities instead.';
export const VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE = 'Root entities are not embeddable. Embed a child entity or entity extension or use @relation or @reference instead.';
export const VALIDATION_ERROR_EMBEDDED_CHILD_ENTITY_WITHOUT_LIST = 'Child entities are only allowed in lists. Use entity extensions or value objects instead.';
export const VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED = 'Value objects can only use scalars, enums or value objects as field types.';

export class EntityDirectiveNestingValidator implements ASTValidator {

    validate(ast: DocumentNode): ValidationMessage[] {
        return flatMap(getObjectTypes(ast), obj => validateObjectType(ast, obj));
    }
}

function validateObjectType(ast: DocumentNode, objectType: ObjectTypeDefinitionNode): ValidationMessage[] {
    const validationMessages: ValidationMessage[] = [];
    const entityTypeOfObjectType = getEntityTypeDirective(objectType);
    if (!entityTypeOfObjectType) {
        // Yep, that's a bad model state in theory, but this one is checked
        // by ObjectTypeDirectiveCountValidator, so we can skip it here.
        return [];
    }
    validationMessages.push(...flatMap(objectType.fields,field => validateFieldTypeIsAllowedWithinObjectWithThisEntityDirective(ast, field, field.type, entityTypeOfObjectType, field.loc)));
    return validationMessages;

}

function validateFieldTypeIsAllowedWithinObjectWithThisEntityDirective(ast: DocumentNode, field: FieldDefinitionNode, fieldType: TypeNode, entityTypeDirective: string, loc?: Location): ValidationMessage[] {
    switch (fieldType.kind) {
        case NON_NULL_TYPE:
            return validateFieldTypeIsAllowedWithinObjectWithThisEntityDirective(ast, field, fieldType.type, entityTypeDirective, loc);
        case LIST_TYPE:
            const innerTypeDef = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(fieldType.type));
            if (innerTypeDef.kind !== OBJECT_TYPE_DEFINITION) {
                // Don't care about non object types.
                return []
            }
            const innerEntityTypeDirective = getEntityTypeDirective(innerTypeDef);
            if (entityTypeDirective === VALUE_OBJECT_DIRECTIVE && innerEntityTypeDirective !== VALUE_OBJECT_DIRECTIVE && !hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
                return [ValidationMessage.error(VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED, {}, loc)]
            }
            switch (innerEntityTypeDirective) {
                case ENTITY_EXTENSION_DIRECTIVE:
                    return [ValidationMessage.error(VALIDATION_ERROR_LISTS_OF_ENTITY_EXTENSIONS_NOT_ALLOWED, {}, loc)];
                case ROOT_ENTITY_DIRECTIVE:
                    if (hasDirectiveWithName(field, RELATION_DIRECTIVE) || hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
                        return [];
                    }
                    return [ValidationMessage.error(VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE, {}, loc)];
                default: return [];
            }
        case NAMED_TYPE:
            const innerTypeDefinition = getNamedTypeDefinitionAST(ast, getTypeNameIgnoringNonNullAndList(fieldType));
            if (innerTypeDefinition.kind !== OBJECT_TYPE_DEFINITION) {
                // Don't care about non object types.
                return []
            }
            const innerEntityTypeDir = getEntityTypeDirective(innerTypeDefinition);
            if (entityTypeDirective === VALUE_OBJECT_DIRECTIVE && innerEntityTypeDir !== VALUE_OBJECT_DIRECTIVE && !hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
                return [ValidationMessage.error(VALIDATION_ERROR_ENTITY_IN_VALUE_OBJECT_NOT_ALLOWED, {}, loc)]
            }
            switch (innerEntityTypeDir) {
                case CHILD_ENTITY_DIRECTIVE:
                    return [ValidationMessage.error(VALIDATION_ERROR_EMBEDDED_CHILD_ENTITY_WITHOUT_LIST, {}, loc)];
                case ROOT_ENTITY_DIRECTIVE:
                    if (hasDirectiveWithName(field, RELATION_DIRECTIVE) || hasDirectiveWithName(field, REFERENCE_DIRECTIVE)) {
                        return [];
                    }
                    return [ValidationMessage.error(VALIDATION_ERROR_ROOT_ENTITY_NOT_EMBEDDABLE, {}, loc)];
                default: return [];
            }

        default: return []
    }
}

function getEntityTypeDirective(objectType: ObjectTypeDefinitionNode) {
    if (objectType.directives == undefined) {
        return null;
    }
    return objectType.directives.find(directive => OBJECT_TYPE_ENTITY_DIRECTIVES.includes(directive.name.value))!.name.value;
}


