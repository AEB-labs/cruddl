import * as pluralize from 'pluralize';
import { decapitalize } from '../../utils/utils';
import { BillingEntityType, Relation, RootEntityType } from '../../model';

export const billingCollectionName = 'billing';

export function getCollectionNameForRootEntity(type: RootEntityType) {
    return decapitalize(pluralize(type.name));
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}

