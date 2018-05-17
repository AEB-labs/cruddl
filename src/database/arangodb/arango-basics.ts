import * as pluralize from 'pluralize';
import { decapitalize } from '../../utils/utils';
import { EdgeType } from '../../schema/edges';
import { RootEntityType } from '../../model';

export function getCollectionNameForRootEntity(type: RootEntityType) {
    return decapitalize(pluralize(type.name));
}

export function getCollectionNameForEdge(edgeType: EdgeType) {
    return getCollectionNameForRootEntity(edgeType.fromType) + '_' + edgeType.fromField.name;
}
