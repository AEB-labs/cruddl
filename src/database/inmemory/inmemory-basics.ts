import { Relation, RootEntityType } from '../../model/index.js';
import { decapitalize } from '../../utils/utils.js';

export function getCollectionNameForRootEntity(rootEntityType: RootEntityType) {
    return decapitalize(rootEntityType.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
