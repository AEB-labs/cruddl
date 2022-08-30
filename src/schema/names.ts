import { RootEntityType } from '../model/implementation';
import { capitalize } from '../utils/utils';
import {
    ADD_CHILD_ENTITIES_FIELD_PREFIX,
    ADD_EDGES_FIELD_PREFIX,
    ALL_ENTITIES_FIELD_PREFIX,
    CONFIRM_FOR_BILLING_FIELD_PREFIX,
    CREATE_ENTITY_FIELD_PREFIX,
    CREATE_RELATED_ENTITY_FIELD_PREFIX,
    DELETE_ALL_ENTITIES_FIELD_PREFIX,
    DELETE_ENTITY_FIELD_PREFIX,
    FLEX_SEARCH_ENTITIES_FIELD_PREFIX,
    REMOVE_CHILD_ENTITIES_FIELD_PREFIX,
    REMOVE_EDGES_FIELD_PREFIX,
    UPDATE_ALL_ENTITIES_FIELD_PREFIX,
    UPDATE_CHILD_ENTITIES_FIELD_PREFIX,
    UPDATE_ENTITY_FIELD_PREFIX,
} from './constants';

export function getAllEntitiesFieldName(rootEntityType: RootEntityType) {
    return ALL_ENTITIES_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getFlexSearchEntitiesFieldName(rootEntityType: RootEntityType) {
    return FLEX_SEARCH_ENTITIES_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getCreateEntityFieldName(rootEntityType: RootEntityType) {
    return CREATE_ENTITY_FIELD_PREFIX + rootEntityType.name;
}

export function getCreateEntitiesFieldName(rootEntityType: RootEntityType) {
    return CREATE_ENTITY_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getUpdateEntityFieldName(rootEntityType: RootEntityType) {
    return UPDATE_ENTITY_FIELD_PREFIX + rootEntityType.name;
}

export function getUpdateEntitiesFieldName(rootEntityType: RootEntityType) {
    return UPDATE_ENTITY_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getUpdateAllEntitiesFieldName(rootEntityType: RootEntityType) {
    return UPDATE_ALL_ENTITIES_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getDeleteEntityFieldName(rootEntityType: RootEntityType) {
    return DELETE_ENTITY_FIELD_PREFIX + rootEntityType.name;
}

export function getDeleteEntitiesFieldName(rootEntityType: RootEntityType) {
    return DELETE_ENTITY_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getDeleteAllEntitiesFieldName(rootEntityType: RootEntityType) {
    return DELETE_ALL_ENTITIES_FIELD_PREFIX + rootEntityType.pluralName;
}

export function getConfirmForBillingFieldName(entityName: string) {
    return CONFIRM_FOR_BILLING_FIELD_PREFIX + entityName;
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

export function getReplaceChildEntitiesFieldName(fieldName: string) {
    return fieldName;
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

export function getFlexSearchFilterTypeName(typeName: string, isAggregation: boolean) {
    return `${typeName}${isAggregation ? 'Aggregation' : ''}FlexSearchFilter`;
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

export function getUpdateAllInputTypeName(rootEntityType: RootEntityType) {
    return `UpdateAll${rootEntityType.pluralName}Input`;
}
