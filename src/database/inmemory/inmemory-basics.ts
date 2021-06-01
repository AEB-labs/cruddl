import { decapitalize } from '../../utils/utils';
import { Relation, RootEntityType } from '../../model';

export function getCollectionNameForRootEntity(rootEntityType: RootEntityType) {
    return decapitalize(rootEntityType.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
