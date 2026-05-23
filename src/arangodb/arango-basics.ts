import type { Relation } from '../core/model/implementation/relation.js';
import type { RootEntityType } from '../core/model/implementation/root-entity-type.js';
import { decapitalize } from '../core/utils/utils.js';

export const billingCollectionName = 'billingEntities';

export function getCollectionNameForRootEntity(
    type: RootEntityType,
    { prefix }: { prefix: string | undefined },
) {
    return (prefix ?? '') + decapitalize(type.pluralName);
}

export function getCollectionNameForRelation(
    relation: Relation,
    { prefix }: { prefix: string | undefined },
) {
    return (
        getCollectionNameForRootEntity(relation.fromType, { prefix }) +
        '_' +
        relation.fromField.name
    );
}
