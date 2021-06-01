import { Relation, RootEntityType } from '../../model';
import { decapitalize } from '../../utils/utils';

export const billingCollectionName = 'billingEntities';

export function getCollectionNameForRootEntity(type: RootEntityType) {
    return decapitalize(type.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
