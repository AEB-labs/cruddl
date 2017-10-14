import { FieldRequest, FieldSelection } from '../graphql/query-distiller';
import { getNamedType, GraphQLField, GraphQLObjectType } from 'graphql';
import {
    BasicType, BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, EntitiesQueryNode, FieldQueryNode,
    FirstOfListQueryNode, FollowEdgeQueryNode, ListQueryNode, LiteralQueryNode, NullQueryNode, ObjectQueryNode,
    PropertySpecification, QueryNode, RootEntityIDQueryNode, TransformListQueryNode, TypeCheckQueryNode,
    VariableQueryNode
} from './definition';
import { createCursorQueryNode, createOrderSpecification, createPaginationFilterNode } from './pagination-and-sorting';
import { createFilterNode } from './filtering';
import {
    AFTER_ARG, ALL_ENTITIES_FIELD_PREFIX, CURSOR_FIELD, FILTER_ARG, FIRST_ARG, ID_FIELD, ORDER_BY_ARG
} from '../schema/schema-defaults';
import { capitalize, decapitalize, objectEntries } from '../utils/utils';
import { createScalarFieldValueNode } from './common';
import { isListType } from '../graphql/schema-utils';
import { getSingleKeyField, isReferenceField, isRelationField, isRootEntityType } from '../schema/schema-utils';
import { getEdgeType } from '../schema/edges';
import { createListMetaNode } from './list-meta';

/**
 * Creates a QueryNode for a field of the root query type
 * @param {FieldRequest} fieldRequest the query field, such as allEntities
 */
export function createQueryRootNode(fieldRequest: FieldRequest): QueryNode {
    if (isEntitiesQueryField(fieldRequest.field)) {
        return createAllEntitiesFieldNode(fieldRequest, [fieldRequest]);
    }
    if (isMetaField(fieldRequest.field)) {
        return createEntitiesMetaFieldNode(fieldRequest);
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

function createEntitiesMetaFieldNode(fieldRequest: FieldRequest): QueryNode {
    const listFieldName = unwrapMetaFieldName(fieldRequest.field);
    const listField = fieldRequest.schema.getQueryType().getFields()[listFieldName];
    if (!listField) {
        throw new Error(`Requesting meta field ${fieldRequest.fieldName}, but list field ${listFieldName} does not exist on Query`);
    }
    const objectType = getNamedType(listField.type) as GraphQLObjectType;
    const listNode = new EntitiesQueryNode(objectType);
    return createListMetaNode(fieldRequest, listNode, objectType);
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
    const edgeType = getEdgeType(getNamedType(fieldRequest.parentType) as GraphQLObjectType, fieldRequest.field);
    const followNode = new FollowEdgeQueryNode(edgeType, sourceEntityNode);
    const relatedNode = new FirstOfListQueryNode(followNode);
    return createEntityObjectNode(fieldRequest.selectionSet, relatedNode, fieldRequestStack);
}

function createToNRelationQueryNode(fieldRequest: FieldRequest, sourceEntityNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    const edgeType = getEdgeType(getNamedType(fieldRequest.parentType) as GraphQLObjectType, fieldRequest.field);
    const followNode = new FollowEdgeQueryNode(edgeType, sourceEntityNode);
    return createTransformListQueryNode(fieldRequest, followNode, fieldRequestStack);
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

    if (isRootEntityType(fieldRequest.parentType) && fieldRequest.field.name == ID_FIELD) {
        return new RootEntityIDQueryNode(entityNode);
    }

    if (isMetaField(fieldRequest.field)) {
        const objectType = fieldRequest.parentType as GraphQLObjectType;
        const listFieldName = unwrapMetaFieldName(fieldRequest.field);
        const listField = objectType.getFields()[listFieldName];
        if (!listField) {
            throw new Error(`Requested meta field ${fieldRequest.field.name} but associated list field ${listFieldName} does not exist in object type ${objectType.name}`);
        }
        const listNode = new FieldQueryNode(entityNode, listField);
        // TODO support references and relations
        return createListMetaNode(fieldRequest, createSafeListQueryNode(listNode), getNamedType(listField.type) as GraphQLObjectType);
    }

    const fieldNode = new FieldQueryNode(entityNode, fieldRequest.field);
    if (isListType(type)) {
        if (rawType instanceof GraphQLObjectType) {
            // support filters, order by and pagination
            return createSafeTransformListQueryNode(fieldRequest, fieldNode, fieldRequestStack);
        } else {
            return createSafeListQueryNode(fieldNode);
        }
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

function createSafeListQueryNode(listNode: QueryNode) {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );
}

function createSafeTransformListQueryNode(fieldRequest: FieldRequest, listNode: QueryNode, fieldRequestStack: FieldRequest[]): QueryNode {
    return createTransformListQueryNode(fieldRequest, createSafeListQueryNode(listNode), fieldRequestStack);
}

function isEntitiesQueryField(field: GraphQLField<any, any>) {
    return field.name.startsWith(ALL_ENTITIES_FIELD_PREFIX);
}

function isMetaField(field: GraphQLField<any, any>) {
    return field.name.startsWith('_') && field.name.endsWith('Meta');
}

function unwrapMetaFieldName(field: GraphQLField<any, any>): string {
    return field.name.substr(1, field.name.length - '_Meta'.length);
}