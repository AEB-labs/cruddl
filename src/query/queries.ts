import { FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLField, GraphQLList, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, ContextQueryNode, EntitiesQueryNode,
    FieldQueryNode, ListQueryNode, LiteralQueryNode, ObjectQueryNode, PropertySpecification, QueryNode,
    TypeCheckQueryNode
} from './definition';
import { createCursorQueryNode, createOrderSpecification, createPaginationFilterNode } from './pagination-and-sorting';
import { createFilterNode } from './filtering';
import {
    AFTER_ARG, ALL_ENTITIES_FIELD_PREFIX, CURSOR_FIELD, FILTER_ARG, FIRST_ARG, ORDER_BY_ARG
} from '../schema/schema-defaults';

/**
 * Creates a QueryNode for a field of the root query type
 * @param {FieldRequest} fieldRequest the query field, such as allEntities
 */
export function createQueryRootNode(fieldRequest: FieldRequest): QueryNode {
    if (isEntitiesQueryField(fieldRequest.field)) {
        return createEntitiesQueryNode(fieldRequest, [ fieldRequest ]);
    }

    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createEntitiesQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createListQueryNode(fieldRequest, listNode, fieldRequestStack);
}

/**
 * Creates a QueryNode for the value of querying a specific entity
 * @param {FieldSelection[]} fieldSelections specifies what to select in the entity (e.g. the fieldSelections of an allEntities query)
 * @param {QueryNode} contextNode a node that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the enclosing fieldRequest of fieldSeletions
 * @returns {ObjectQueryNode}
 */
export function createEntityObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName,
            createEntityFieldQueryNode(sel.fieldRequest, contextNode, [...fieldRequestStack, sel.fieldRequest]))));
}

/**
 * Creates a QueryNode for a specific field to query from an entity
 * @param {FieldRequest} fieldRequest the field, e.g. "id"
 * @param {QueryNode} contextNode the QueryNode that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the fieldRequest arg
 * @returns {QueryNode}
 */
function createEntityFieldQueryNode(fieldRequest: FieldRequest, contextNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    if (fieldRequest.fieldName == CURSOR_FIELD) {
        return createCursorQueryNode(fieldRequestStack[fieldRequestStack.length - 2], new ContextQueryNode());
    }

    const type = fieldRequest.field.type;
    const rawType = getNamedType(type);
    const fieldNode = new FieldQueryNode(contextNode, fieldRequest.field);
    if (type instanceof GraphQLList && rawType instanceof GraphQLObjectType) {
        return createConditionalListQueryNode(fieldRequest, fieldNode, fieldRequestStack);
    }
    if (rawType instanceof GraphQLObjectType) {
        return createConditionalObjectNode(fieldRequest.selectionSet, fieldNode, fieldRequestStack);
    }
    return fieldNode;
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createEntityObjectNode(fieldSelections, contextNode, fieldRequestStack),
        new LiteralQueryNode(null));
}

function createListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const orderBy = createOrderSpecification(fieldRequest.args[ORDER_BY_ARG], objectType, fieldRequest);
    const basicFilterNode = createFilterNode(fieldRequest.args[FILTER_ARG], objectType);
    const paginationFilterNode = createPaginationFilterNode(fieldRequest.args[AFTER_ARG], orderBy);
    const filterNode = new BinaryOperationQueryNode(basicFilterNode, BinaryOperator.AND, paginationFilterNode);
    const innerNode = createEntityObjectNode(fieldRequest.selectionSet, new ContextQueryNode(), fieldRequestStack);
    const maxCount = fieldRequest.args[FIRST_ARG];
    return new ListQueryNode({listNode, innerNode, filterNode, orderBy, maxCount});
}

function createConditionalListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    const safeList = new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new LiteralQueryNode([])
    );

    return createListQueryNode(fieldRequest, safeList, fieldRequestStack);
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith(ALL_ENTITIES_FIELD_PREFIX);
}
