import * as pluralize from 'pluralize';
import { decapitalize } from '../../utils/utils';
import { Relation, RootEntityType } from '../../model';

export function getCollectionNameForRootEntity(type: RootEntityType) {
    return decapitalize(type.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
