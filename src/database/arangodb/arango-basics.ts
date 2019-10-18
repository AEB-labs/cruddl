import * as pluralize from 'pluralize';
import { BillingEntityType } from '../../model/implementation/billing';
import { decapitalize } from '../../utils/utils';
import { Relation, RootEntityType } from '../../model';

export const billingCollectionPrefix = 'billing_';

export function getCollectionNameForRootEntity(type: RootEntityType) {
    return decapitalize(pluralize(type.name));
}

export function getCollectionNameForRelation(relation: Relation) {
    return getCollectionNameForRootEntity(relation.fromType) + '_' + relation.fromField.name;
}

export function getCollectionNameForBillingEntityType(type: BillingEntityType) {

    return billingCollectionPrefix + getCollectionNameForRootEntity(type.rootEntityType!);
}
