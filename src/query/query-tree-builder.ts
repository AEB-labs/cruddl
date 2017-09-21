import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLCompositeType, GraphQLField, GraphQLObjectType } from 'graphql';
import {
    BinaryOperationQueryNode, BinaryOperator,
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
    const filter = fieldRequest.args.filter;
    let filterNode: QueryNode|undefined = undefined;
    if (filter) {
        for (const key of Object.getOwnPropertyNames(filter)) {
            const fieldQuery = new FieldQueryNode(objectType.getFields()[key]);
            const valueQuery = new LiteralQueryNode(filter[key]);
            const newClause = new BinaryOperationQueryNode(fieldQuery, BinaryOperator.EQUALS, valueQuery);
            if (filterNode) {
                filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, newClause);
            } else {
                filterNode = newClause;
            }
        }
    }
    const innerNode = createObjectNode(fieldRequest.selectionSet);
    return new EntitiesQueryNode({objectType, innerNode, filterNode});
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
