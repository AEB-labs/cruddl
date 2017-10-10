import {ObjectTypeDefinitionNode} from "graphql";
import * as pluralize from "pluralize";
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX,
    ALL_ENTITIES_FIELD_PREFIX,
    CHILD_ENTITY_DIRECTIVE,
    CREATE_ENTITY_FIELD_PREFIX,
    DELETE_ENTITY_FIELD_PREFIX,
    ORDER_BY_ASC_SUFFIX,
    ORDER_BY_DESC_SUFFIX, REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
    ROOT_ENTITY_DIRECTIVE, UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ENTITY_FIELD_PREFIX
} from '../schema/schema-defaults';
import {capitalize} from "../utils/utils";
import {hasDirectiveWithName} from "../schema/schema-utils";


export function getFilterTypeName(entityDefinition: ObjectTypeDefinitionNode) {
    return entityDefinition.name.value + 'Filter';
}

export function getCreateInputTypeName(objectType: ObjectTypeDefinitionNode) {
    if (hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE) || hasDirectiveWithName(objectType, CHILD_ENTITY_DIRECTIVE)) {
        return 'Create' + objectType.name.value + 'Input';
    }
    return objectType.name.value + 'Input';
}

export function getUpdateInputTypeName(objectType: ObjectTypeDefinitionNode) {
    if (hasDirectiveWithName(objectType, ROOT_ENTITY_DIRECTIVE) || hasDirectiveWithName(objectType, CHILD_ENTITY_DIRECTIVE)) {
        return 'Update' + objectType.name.value + 'Input';
    }
    return objectType.name.value + 'Input';
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
    return name + '_not';
}

export function inField(name: string) {
    return name + '_in';
}

export function notInField(name: string) {
    return name + '_not_in';
}

export function ltField(name: string) {
    return name + '_lt';
}

export function lteField(name: string) {
    return name + '_lte';
}

export function gtField(name: string) {
    return name + '_gt';
}

export function gteField(name: string) {
    return name + '_gte';
}

export function containsField(name: string) {
    return name + '_contains';
}

export function notContainsField(name: string) {
    return name + '_not_contains';
}

export function starts_with_field(name: string) {
    return name + '_starts_with';
}

export function not_starts_with_field(name: string) {
    return name + '_not_starts_with';
}

export function endsWithField(name: string) {
    return name + '_ends_with';
}

export function notEndsWithField(name: string) {
    return name + '_not_ends_with';
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

export function deleteEntityQuery(entityName: string) {
    return DELETE_ENTITY_FIELD_PREFIX + entityName;
}

export function sortedByAsc(name: string) {
    return name + ORDER_BY_ASC_SUFFIX;
}

export function sortedByDesc(name: string) {
    return name + ORDER_BY_DESC_SUFFIX;
}
