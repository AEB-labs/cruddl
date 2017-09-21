import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLCompositeType, GraphQLField, GraphQLList, GraphQLObjectType } from 'graphql';
import {
    BasicType,
    BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, ContextQueryNode, EntitiesQueryNode, FieldQueryNode,
    ListQueryNode,
    LiteralQueryNode, ObjectQueryNode, PropertySpecification, QueryNode, TypeCheckQueryNode
} from './definition';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} rootFieldRequest the graphql query
 */
export function createQueryTree(operation: DistilledOperation) {
    return createObjectNode(operation.selectionSet);
}

function createObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode = new ContextQueryNode()) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName, createQueryNodeForField(sel.fieldRequest, contextNode))));
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode = new ContextQueryNode()) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createObjectNode(fieldSelections, contextNode),
        new LiteralQueryNode(null));
}

function createQueryNodeForField(fieldRequest: FieldRequest, contextNode: QueryNode = new ContextQueryNode()): QueryNode {
    if (isQueryType(fieldRequest.parentType) && isEntitiesQueryField(fieldRequest.field)) {
        return createEntitiesQueryNode(fieldRequest);
    }
    if (isEntityType(fieldRequest.parentType)) {
        const type = fieldRequest.field.type;
        const rawType = getNamedType(type);
        const fieldNode = new FieldQueryNode(contextNode, fieldRequest.field);
        if (type instanceof GraphQLList && rawType instanceof GraphQLObjectType) {
            return createListQueryNode(fieldRequest, fieldNode);
        }
        if (rawType instanceof GraphQLObjectType) {
            return createConditionalObjectNode(fieldRequest.selectionSet, fieldNode);
        }
        return fieldNode;
    }
    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
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
        const fieldQuery = new FieldQueryNode(new ContextQueryNode(), objectType.getFields()[key]);
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
