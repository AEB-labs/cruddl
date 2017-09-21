import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLCompositeType, GraphQLField, GraphQLList, GraphQLObjectType } from 'graphql';
import {
    BinaryOperationQueryNode, BinaryOperator,
    EntitiesQueryNode, FieldQueryNode, ListQueryNode, LiteralQueryNode, ObjectQueryNode, PropertySpecification,
    QueryNode
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
        if (fieldRequest.field.type instanceof GraphQLList && getNamedType(fieldRequest.field.type) instanceof GraphQLObjectType) {
            return createListQueryNode(fieldRequest);
        }
        return new FieldQueryNode(fieldRequest.field);
    }
    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createListQueryNode(fieldRequest: FieldRequest): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new FieldQueryNode(fieldRequest.field);
    const filterNode = getFilterNode(fieldRequest.args.filter, objectType);
    const innerNode = createObjectNode(fieldRequest.selectionSet);
    return new ListQueryNode({listNode, innerNode, filterNode});
}

function createEntitiesQueryNode(fieldRequest: FieldRequest): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const filterNode = getFilterNode(fieldRequest.args.filter, objectType);
    const innerNode = createObjectNode(fieldRequest.selectionSet);
    return new EntitiesQueryNode({objectType, innerNode, filterNode});
}

function getFilterNode(filterArg: any, objectType: GraphQLObjectType) {
    if (!filterArg) {
        return undefined;
    }
    let filterNode: QueryNode|undefined = undefined;
    for (const key of Object.getOwnPropertyNames(filterArg)) {
        const fieldQuery = new FieldQueryNode(objectType.getFields()[key]);
        const valueQuery = new LiteralQueryNode(filterArg[key]);
        const newClause = new BinaryOperationQueryNode(fieldQuery, BinaryOperator.EQUALS, valueQuery);
        if (filterNode) {
            filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, newClause);
        } else {
            filterNode = newClause;
        }
    }
    return filterNode;
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
