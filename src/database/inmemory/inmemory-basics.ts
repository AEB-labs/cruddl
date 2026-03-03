import { Relation, RootEntityType } from '../../model';
import { decapitalize } from '../../utils/utils';

export function getCollectionNameForRootEntity(rootEntityType: RootEntityType) {
    return decapitalize(rootEntityType.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
