import {ObjectTypeDefinitionNode} from "graphql";
import * as pluralize from "pluralize";


export function getFilterTypeName(entityDefinition: ObjectTypeDefinitionNode) {
    return entityDefinition.name.value + 'Filter';
}

export function getValueObjectInputTypeName(embeddableDefinition: ObjectTypeDefinitionNode) {
    return embeddableDefinition.name.value + 'Input';
}

export function getRootEntityOrderByTypeName(entityDefinition: ObjectTypeDefinitionNode) {
    return entityDefinition.name.value + 'OrderBy';
}

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
    return name + '_starts_with_contains';
}

export function not_starts_with_field(name: string) {
    return name + '_not_starts_with_contains';
}

export function endsWithField(name: string) {
    return name + '_ends_with_contains';
}

export function notEndsWithField(name: string) {
    return name + '_not_ends_with_contains';
}

export function allEntitiesQueryBy(entityName: string) {
    return 'all' + pluralize(entityName);
}
