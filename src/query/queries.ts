import { FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLField, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, EntitiesQueryNode, FieldQueryNode,
    FirstOfListQueryNode, ListQueryNode, LiteralQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification,
    QueryNode, TransformListQueryNode, TypeCheckQueryNode, VariableQueryNode
} from './definition';
import { createCursorQueryNode, createOrderSpecification, createPaginationFilterNode } from './pagination-and-sorting';
import { createFilterNode } from './filtering';
import {
    AFTER_ARG, ALL_ENTITIES_FIELD_PREFIX, CURSOR_FIELD, FILTER_ARG, FIRST_ARG, ORDER_BY_ARG
} from '../schema/schema-defaults';
import { decapitalize, objectEntries } from '../utils/utils';
import { createScalarFieldValueNode } from './common';
import { isListType } from '../graphql/schema-utils';
import { getSingleKeyField, isReferenceField, isRelationField } from '../schema/schema-utils';

/**
 * Creates a QueryNode for a field of the root query type
 * @param {FieldRequest} fieldRequest the query field, such as allEntities
 */
export function createQueryRootNode(fieldRequest: FieldRequest): QueryNode {
    if (isEntitiesQueryField(fieldRequest.field)) {
        return createAllEntitiesFieldNode(fieldRequest, [fieldRequest]);
    }
    if (fieldRequest.field.type instanceof GraphQLObjectType) {
        return createSingleEntityFieldNode(fieldRequest, [fieldRequest]);
    }

    console.log(`unknown field: ${fieldRequest.fieldName}`);
    return new NullQueryNode();
}

function createAllEntitiesFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createTransformListQueryNode(fieldRequest, listNode, fieldRequestStack);
}

function createSingleEntityFieldNode(fieldRequest: FieldRequest, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const entityVarNode = new VariableQueryNode(decapitalize(objectType.name));
    const filterClauses = objectEntries(fieldRequest.args).map(([fieldName, value]) =>
        new BinaryOperationQueryNode(createScalarFieldValueNode(objectType, fieldName, entityVarNode), BinaryOperator.EQUAL, new LiteralQueryNode(value)));
    if (filterClauses.length != 1) {
        throw new Error(`Must specify exactly one argument to ${fieldRequest.field.type.toString()}.${fieldRequest.field.name}`);
    }
    const filterNode = filterClauses[0];
    const innerNode = createConditionalObjectNode(fieldRequest.selectionSet, entityVarNode, fieldRequestStack);
    const listNode = new EntitiesQueryNode(objectType);
    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode,
        innerNode,
        itemVariable: entityVarNode
    });
    return new FirstOfListQueryNode(filteredListNode);
}

/**
 * Creates a QueryNode for the value of querying a specific entity
 * @param {FieldSelection[]} fieldSelections specifies what to select in the entity (e.g. the fieldSelections of an allEntities query)
 * @param {QueryNode} sourceObjectNode a node that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the enclosing fieldRequest of fieldSeletions
 * @returns {ObjectQueryNode}
 */
export function createEntityObjectNode(fieldSelections: FieldSelection[], sourceObjectNode: QueryNode, fieldRequestStack: FieldRequest[]) {
    return new ObjectQueryNode(fieldSelections.map(
        sel => new PropertySpecification(sel.propertyName,
            createEntityFieldQueryNode(sel.fieldRequest, sourceObjectNode, [...fieldRequestStack, sel.fieldRequest]))));
}

function createTo1RelationQueryNode(fieldRequest: FieldRequest, sourceEntityNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    // TODO
    throw new Error(`not yet implemented`);
}

function createToNRelationQueryNode(fieldRequest: FieldRequest, sourceEntityNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    // TODO
    throw new Error(`not yet implemented`);
}

function createTo1ReferenceQueryNode(fieldRequest: FieldRequest, keyNode: FieldQueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const referencedEntityType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const keyField = getSingleKeyField(referencedEntityType);
    if (!keyField) {
        throw new Error(`Type ${referencedEntityType} referenced in field ${fieldRequest.field.name} does not declare a single key field`);
    }

    const listItemVar = new VariableQueryNode(fieldRequest.fieldName);
    const filterNode = new BinaryOperationQueryNode(
        new FieldQueryNode(listItemVar, keyField),
        BinaryOperator.EQUAL,
        keyNode
    );

    const innerNode = createConditionalObjectNode(fieldRequest.selectionSet, listItemVar, fieldRequestStack);
    const listNode = new EntitiesQueryNode(referencedEntityType);
    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode,
        innerNode,
        maxCount: 1,
        itemVariable: listItemVar
    });
    return new FirstOfListQueryNode(filteredListNode);
}

/**
 * Creates a QueryNode for a specific field to query from an entity
 * @param {FieldRequest} fieldRequest the field, e.g. "id"
 * @param {QueryNode} entityNode the QueryNode that evaluates to the entity
 * @param {FieldRequest[]} fieldRequestStack parent field requests, up to (including) the fieldRequest arg
 * @returns {QueryNode}
 */
function createEntityFieldQueryNode(fieldRequest: FieldRequest, entityNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    if (fieldRequest.fieldName == CURSOR_FIELD) {
        return createCursorQueryNode(fieldRequestStack[fieldRequestStack.length - 2], entityNode);
    }

    const type = fieldRequest.field.type;
    const rawType = getNamedType(type);

    if (isRelationField(fieldRequest.field)) {
        if (isListType(type)) {
            return createToNRelationQueryNode(fieldRequest, entityNode, fieldRequestStack);
        } else {
            return createTo1RelationQueryNode(fieldRequest, entityNode, fieldRequestStack);
        }
    }

    if (isReferenceField(fieldRequest.field)) {
        if (isListType(type)) {
            throw new Error(`References in lists are not supported yet`);
        } else {
            const keyNode = new FieldQueryNode(entityNode, fieldRequest.field);
            return createTo1ReferenceQueryNode(fieldRequest, keyNode, fieldRequestStack);
        }
    }

    const fieldNode = new FieldQueryNode(entityNode, fieldRequest.field);
    // TODO fall back to empty list if not IS_LIST even in the case of scalar lists
    if (isListType(type) && rawType instanceof GraphQLObjectType) {
        return createSafeTransformListQueryNode(fieldRequest, fieldNode, fieldRequestStack);
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
        new NullQueryNode());
}

function createTransformListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const objectType = getNamedType(fieldRequest.field.type) as GraphQLObjectType;
    const itemVarNode = new VariableQueryNode(decapitalize(objectType.name));
    const orderBy = createOrderSpecification(fieldRequest.args[ORDER_BY_ARG], objectType, fieldRequest, itemVarNode);
    const basicFilterNode = createFilterNode(fieldRequest.args[FILTER_ARG], objectType, itemVarNode);
    const paginationFilterNode = createPaginationFilterNode(fieldRequest.args[AFTER_ARG], orderBy);
    const filterNode = new BinaryOperationQueryNode(basicFilterNode, BinaryOperator.AND, paginationFilterNode);
    const innerNode = createEntityObjectNode(fieldRequest.selectionSet, itemVarNode, fieldRequestStack);
    const maxCount = fieldRequest.args[FIRST_ARG];
    return new TransformListQueryNode({
        listNode,
        innerNode,
        filterNode,
        orderBy,
        maxCount,
        itemVariable: itemVarNode
    });
}

function createSafeTransformListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    const safeList = new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );

    return createTransformListQueryNode(fieldRequest, safeList, fieldRequestStack);
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith(ALL_ENTITIES_FIELD_PREFIX);
}
