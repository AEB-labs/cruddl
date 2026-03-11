import type { Relation, RootEntityType } from '../../model/index.js';
import { decapitalize } from '../../utils/utils.js';

export const billingCollectionName = 'billingEntities';

export function getCollectionNameForRootEntity(type: RootEntityType) {
    return decapitalize(type.pluralName);
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}
