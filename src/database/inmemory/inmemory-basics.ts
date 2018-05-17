import * as pluralize from 'pluralize';
import { decapitalize } from '../../utils/utils';
import { EdgeType } from '../../schema/edges';
import { RootEntityType } from '../../model';

export function getCollectionNameForRootEntity(rootEntityType: RootEntityType) {
    return decapitalize(pluralize(rootEntityType.name));
}

export function getCollectionNameForEdge(edgeType: EdgeType) {
    return getCollectionNameForRootEntity(edgeType.fromType) + '_' + edgeType.fromField.name;
}
