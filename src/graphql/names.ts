import {ObjectTypeDefinitionNode, TypeDefinitionNode} from "graphql";
import * as pluralize from "pluralize";
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX,
    ALL_ENTITIES_FIELD_PREFIX,
    CHILD_ENTITY_DIRECTIVE,
    CREATE_ENTITY_FIELD_PREFIX, DELETE_ALL_ENTITIES_FIELD_PREFIX,
    DELETE_ENTITY_FIELD_PREFIX,
    INPUT_FIELD_CONTAINS,
    INPUT_FIELD_ENDS_WITH,
    INPUT_FIELD_EVERY,
    INPUT_FIELD_GT,
    INPUT_FIELD_GTE, INPUT_FIELD_IN,
    INPUT_FIELD_LT,
    INPUT_FIELD_LTE,
    INPUT_FIELD_NONE,
    INPUT_FIELD_NOT,
    INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH,
    INPUT_FIELD_NOT_IN,
    INPUT_FIELD_NOT_STARTS_WITH,
    INPUT_FIELD_SEPARATOR,
    INPUT_FIELD_SOME,
    INPUT_FIELD_STARTS_WITH,
    ORDER_BY_ASC_SUFFIX,
    ORDER_BY_DESC_SUFFIX,
    REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
    ROOT_ENTITY_DIRECTIVE, UPDATE_ALL_ENTITIES_FIELD_PREFIX,
    UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ENTITY_FIELD_PREFIX
} from '../schema/schema-defaults';
import {capitalize} from "../utils/utils";
import {hasDirectiveWithName} from "../schema/schema-utils";

export function getFilterTypeName(entityDefinition: TypeDefinitionNode|string) {
    if (typeof(entityDefinition) === 'string') {
        return entityDefinition + 'Filter';
    }
    return entityDefinition.name.value + 'Filter';
}

/**
 * Don't use for root entities and child entities, use getCreateInputTypeName or getUpdateInputTypeName instead.
 */
export function getInputTypeName(objectType: ObjectTypeDefinitionNode) {
    if (hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE) || hasDirectiveWithName(objectType, CHILD_ENTITY_DIRECTIVE)) {
        throw new Error(`Can't call getInputTypeName() on root and child entities`);
    }
    return objectType.name.value + 'Input';
}

export function getCreateInputTypeName(objectType: ObjectTypeDefinitionNode) {
    if (hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE) || hasDirectiveWithName(objectType, CHILD_ENTITY_DIRECTIVE)) {
        return 'Create' + objectType.name.value + 'Input';
    }
    return getInputTypeName(objectType);
}

export function getUpdateInputTypeName(objectType: ObjectTypeDefinitionNode) {
    if (hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE) || hasDirectiveWithName(objectType, CHILD_ENTITY_DIRECTIVE)) {
        return 'Update' + objectType.name.value + 'Input';
    }
    return getInputTypeName(objectType);
}

export function getUpdateAllInputTypeName(objectType: ObjectTypeDefinitionNode) {
    if (!hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE)) {
        throw new Error(`Calling getUpdateAllInputTypeName() is allowed only for root entities`);
    }
    return 'UpdateAll' + pluralize(objectType.name.value) + 'Input';
}

export function getAddRelationFieldName(fieldName: string) {
    return 'add' + capitalize(fieldName);
}

export function getRemoveRelationFieldName(fieldName: string) {
    return 'remove' + capitalize(fieldName);
}

export function getAddChildEntityFieldName(fieldName: string) {
    return ADD_CHILD_ENTITIES_FIELD_PREFIX + capitalize(fieldName);
}

export function getUpdateChildEntityFieldName(fieldName: string) {
    return UPDATE_CHILD_ENTITIES_FIELD_PREFIX + capitalize(fieldName);
}

export function getRemoveChildEntityFieldName(fieldName: string) {
    return REMOVE_CHILD_ENTITIES_FIELD_PREFIX + capitalize(fieldName);
}

export function getOrderByEnumTypeName(entityDefinition: ObjectTypeDefinitionNode) {
    return entityDefinition.name.value + 'OrderBy';
}


// identifier cross reference: query/filtering.ts

export function notField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_NOT;
}

export function inField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_IN;
}

export function notInField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_NOT_IN;
}

export function ltField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_LT;
}

export function lteField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_LTE;
}

export function gtField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_GT;
}

export function gteField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_GTE;
}

export function containsField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_CONTAINS;
}

export function notContainsField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_NOT_CONTAINS;
}

export function startsWithField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_STARTS_WITH;
}

export function notStartsWithField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_NOT_STARTS_WITH;
}

export function endsWithField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_ENDS_WITH;
}

export function notEndsWithField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_NOT_ENDS_WITH;
}

export function someField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_SOME;
}

export function everyField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_EVERY;
}

export function noneField(name: string) {
    return name + INPUT_FIELD_SEPARATOR + INPUT_FIELD_NONE;
}

export function allEntitiesQueryBy(entityName: string) {
    return ALL_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function getMetaNameFieldFor(field: string) {
    return '_' + field + 'Meta';
}

export function createEntityQuery(entityName: string) {
    return CREATE_ENTITY_FIELD_PREFIX + entityName;
}

export function updateEntityQuery(entityName: string) {
    return UPDATE_ENTITY_FIELD_PREFIX + entityName;
}

export function updateAllEntitiesQuery(entityName: string) {
    return UPDATE_ALL_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function deleteEntityQuery(entityName: string) {
    return DELETE_ENTITY_FIELD_PREFIX + entityName;
}

export function deleteAllEntitiesQuery(entityName: string) {
    return DELETE_ALL_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function sortedByAsc(name: string) {
    return name + ORDER_BY_ASC_SUFFIX;
}

export function sortedByDesc(name: string) {
    return name + ORDER_BY_DESC_SUFFIX;
}

export function namespacedType(namespace: string, opType: string) {
    return capitalize(namespace) + opType;
}
