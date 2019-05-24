import * as pluralize from 'pluralize';
import { capitalize } from '../utils/utils';
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX,
    ADD_EDGES_FIELD_PREFIX,
    ALL_ENTITIES_FIELD_PREFIX,
    CREATE_ENTITY_FIELD_PREFIX,
    CREATE_RELATED_ENTITY_FIELD_PREFIX,
    DELETE_ALL_ENTITIES_FIELD_PREFIX,
    DELETE_ENTITY_FIELD_PREFIX,
    QUICK_SEARCH_ENTITIES_FIELD_PREFIX,
    REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
    REMOVE_EDGES_FIELD_PREFIX,
    UPDATE_ALL_ENTITIES_FIELD_PREFIX,
    UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ENTITY_FIELD_PREFIX
} from './constants';

export function getAllEntitiesFieldName(entityName: string) {
    return ALL_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function getQuickSearchEntitiesFieldName(entityName: string) {
    return QUICK_SEARCH_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function getCreateEntityFieldName(entityName: string) {
    return CREATE_ENTITY_FIELD_PREFIX + entityName;
}

export function getUpdateEntityFieldName(entityName: string) {
    return UPDATE_ENTITY_FIELD_PREFIX + entityName;
}

export function getUpdateAllEntitiesFieldName(entityName: string) {
    return UPDATE_ALL_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function getDeleteEntityFieldName(entityName: string) {
    return DELETE_ENTITY_FIELD_PREFIX + entityName;
}

export function getDeleteAllEntitiesFieldName(entityName: string) {
    return DELETE_ALL_ENTITIES_FIELD_PREFIX + pluralize(entityName);
}

export function getMetaFieldName(field: string) {
    return '_' + field + 'Meta';
}

export function getAddRelationFieldName(fieldName: string) {
    return ADD_EDGES_FIELD_PREFIX + capitalize(fieldName);
}

export function getRemoveRelationFieldName(fieldName: string) {
    return REMOVE_EDGES_FIELD_PREFIX + capitalize(fieldName);
}

export function getAddChildEntitiesFieldName(fieldName: string) {
    return ADD_CHILD_ENTITIES_FIELD_PREFIX + capitalize(fieldName);
}

export function getUpdateChildEntitiesFieldName(fieldName: string) {
    return UPDATE_CHILD_ENTITIES_FIELD_PREFIX + capitalize(fieldName);
}

export function getRemoveChildEntitiesFieldName(fieldName: string) {
    return REMOVE_CHILD_ENTITIES_FIELD_PREFIX + capitalize(fieldName);
}

export function getCreateRelatedEntityFieldName(fieldName: string) {
    return CREATE_RELATED_ENTITY_FIELD_PREFIX + capitalize(fieldName);
}

export function getFilterTypeName(typeName: string) {
    return `${typeName}Filter`;
}

export function getQuickSearchFilterTypeName(typeName: string) {
    return `${typeName}QuickSearchFilter`;
}


export function getOrderByTypeName(typeName: string) {
    return `${typeName}OrderBy`;
}

export function getCreateInputTypeName(typeName: string) {
    return `Create${typeName}Input`;
}

export function getValueObjectInputTypeName(typeName: string) {
    return `${typeName}Input`;
}

export function getUpdateInputTypeName(typeName: string) {
    return `Update${typeName}Input`;
}

export function getUpdateAllInputTypeName(typeName: string) {
    return `UpdateAll${pluralize(typeName)}Input`;
}
