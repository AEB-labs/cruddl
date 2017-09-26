import { DistilledOperation, FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLCompositeType, GraphQLField, GraphQLList, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, ContextAssignmentQueryNode,
    ContextQueryNode, CreateEntityQueryNode, EntitiesQueryNode, FieldQueryNode, ListQueryNode, LiteralQueryNode,
    NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode, TypeCheckQueryNode
} from './definition';
import { createCursorQueryNode, createOrderSpecification, createPaginationFilterNode } from './pagination-and-sorting';
import { createFilterNode } from './filtering';
import {
    AFTER_ARG,
    ALL_ENTITIES_FIELD_PREFIX, CREATE_ENTITY_FIELD_PREFIX, CREATE_INPUT_ARG, CURSOR_FIELD, FILTER_ARG, FIRST_ARG,
    MUTATION_TYPE, ORDER_BY_ARG,
    QUERY_TYPE
} from '../schema/schema-defaults';

/**
 * Creates a QueryTree that is used to instruct the DataBase how to perform a GraphQL query
 * @param {FieldRequest} operation the graphql query
 */
export function createQueryTree(operation: DistilledOperation) {
    return createObjectNode(operation.selectionSet, new NullQueryNode(), []);
}

function createObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName,
            createQueryNodeForField(sel.fieldRequest, contextNode, [...fieldRequestStack, sel.fieldRequest]))));
}

function createConditionalObjectNode(fieldSelections: FieldSelection[], contextNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(contextNode, BasicType.OBJECT),
        createObjectNode(fieldSelections, contextNode, fieldRequestStack),
        new LiteralQueryNode(null));
}

function createQueryNodeForField(fieldRequest: FieldRequest, contextNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    if (isQueryType(fieldRequest.parentType) && isEntitiesQueryField(fieldRequest.field)) {
        return createEntitiesQueryNode(fieldRequest, fieldRequestStack);
    }
    if (isMutationType(fieldRequest.parentType)) {
        if (fieldRequest.fieldName.startsWith(CREATE_ENTITY_FIELD_PREFIX)) {
            return createCreateEntityQueryNode(fieldRequest, fieldRequestStack);
        }
    }
    if (isEntityType(fieldRequest.parentType)) {
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
    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new LiteralQueryNode(null);
}

function createListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const orderBy = createOrderSpecification(fieldRequest.args[ORDER_BY_ARG], objectType, fieldRequest);
    const basicFilterNode = createFilterNode(fieldRequest.args[FILTER_ARG], objectType);
    const paginationFilterNode = createPaginationFilterNode(fieldRequest.args[AFTER_ARG], orderBy);
    const filterNode = new BinaryOperationQueryNode(basicFilterNode, BinaryOperator.AND, paginationFilterNode);
    const innerNode = createObjectNode(fieldRequest.selectionSet, new ContextQueryNode(), fieldRequestStack);
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

function createEntitiesQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createListQueryNode(fieldRequest, listNode, fieldRequestStack);
}

function createCreateEntityQueryNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const entityName = fieldRequest.fieldName.substr('create'.length);
    const entityType = fieldRequest.schema.getTypeMap()[entityName];
    if (!entityType || !(entityType instanceof GraphQLObjectType)) {
        throw new Error(`Object type ${entityName} not found but needed for field ${fieldRequest.fieldName}`);
    }
    const input = fieldRequest.args[CREATE_INPUT_ARG];
    const objectNode = new LiteralQueryNode(input);
    const createEntityNode = new CreateEntityQueryNode(entityType, objectNode);
    const resultNode = createObjectNode(fieldRequest.selectionSet, new ContextQueryNode(), fieldRequestStack);
    return new ContextAssignmentQueryNode(createEntityNode, resultNode);
}

function isQueryType(type: GraphQLCompositeType) {
    return type.name == QUERY_TYPE;
}

function isMutationType(type: GraphQLCompositeType) {
    return type.name == MUTATION_TYPE;
}

function isEntityType(type: GraphQLCompositeType) {
    return !isQueryType(type) && !isMutationType(type);
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith(ALL_ENTITIES_FIELD_PREFIX);
}
