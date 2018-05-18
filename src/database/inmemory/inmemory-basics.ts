import * as pluralize from 'pluralize';
import { decapitalize } from '../../utils/utils';
import { Relation, RootEntityType } from '../../model';

export function getCollectionNameForRootEntity(rootEntityType: RootEntityType) {
    return decapitalize(pluralize(rootEntityType.name));
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
