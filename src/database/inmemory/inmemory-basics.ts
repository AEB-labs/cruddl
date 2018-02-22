import { GraphQLNamedType } from 'graphql';
import * as pluralize from 'pluralize';
import { decapitalize } from '../../utils/utils';
import { EdgeType } from '../../schema/edges';

export function getCollectionNameForRootEntity(type: GraphQLNamedType) {
    return decapitalize(pluralize(type.name));
}

export function getCollectionNameForEdge(edgeType: EdgeType) {
    return getCollectionNameForRootEntity(edgeType.fromType) + '_' + edgeType.fromField.name;
}
