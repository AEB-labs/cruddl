import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLCompositeType, GraphQLField, GraphQLObjectType } from 'graphql';
import {
    EntitiesQueryNode, FieldQueryNode, LiteralQueryNode, ObjectQueryNode, PropertySpecification, QueryNode
} from './definition';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} rootFieldRequest the graphql query
 */
export function createQueryTree(operation: DistilledOperation) {
    return createObjectNode(operation.selectionSet);
}

function createObjectNode(fieldSelections: FieldSelection[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName, createQueryNodeForField(sel.fieldRequest))));
}


function createQueryNodeForField(fieldRequest: FieldRequest): QueryNode {
    if (isQueryType(fieldRequest.parentType) && isEntitiesQueryField(fieldRequest.field)) {
        return createEntitiesQueryNode(fieldRequest);
    }
    if (isEntityType(fieldRequest.parentType)) {
        return new FieldQueryNode(fieldRequest.field);
    }
    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createEntitiesQueryNode(fieldRequest: FieldRequest): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    return new EntitiesQueryNode(objectType, createObjectNode(fieldRequest.selectionSet));
}

function isQueryType(type: GraphQLCompositeType) {
    return type.name == 'Query';
}

function isEntityType(type: GraphQLCompositeType) {
    return type.name != 'Query';
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith('all');
}
