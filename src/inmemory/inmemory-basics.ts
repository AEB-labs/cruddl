import type { Relation } from '../core/model/implementation/relation.js';
import type { RootEntityType } from '../core/model/implementation/root-entity-type.js';
import { decapitalize } from '../core/utils/utils.js';

export function getCollectionNameForRootEntity(rootEntityType: RootEntityType) {
    return decapitalize(rootEntityType.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
