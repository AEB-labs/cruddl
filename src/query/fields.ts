import { getNamedType, GraphQLField, GraphQLObjectType, GraphQLScalarType } from 'graphql';
import {
    FieldQueryNode, RootEntityIDQueryNode, QueryNode, VariableQueryNode, FirstOfListQueryNode, FollowEdgeQueryNode,
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, TransformListQueryNode, ConditionalQueryNode,
    TypeCheckQueryNode, BasicType, NullQueryNode, VariableAssignmentQueryNode
} from './definition';
import { getSingleKeyField, isReferenceField, isRelationField, isRootEntityType } from '../schema/schema-utils';
import { ID_FIELD } from '../schema/schema-defaults';
import { getEdgeType } from '../schema/edges';
import { isListType } from '../graphql/schema-utils';
import { createEntityObjectNode } from './queries';

export function createScalarFieldValueNode(objectType: GraphQLObjectType, fieldName: string, contextNode: QueryNode): QueryNode {
    const field = objectType.getFields()[fieldName];
    if (!field || !(field.type instanceof GraphQLScalarType)) {
        throw new Error(`Field ${fieldName} is not a field of ${objectType.name} with scalar type`);
    }
    return createNonListFieldValueNode({
        parentType: objectType,
        field,
        objectNode: contextNode
    });
}

/**
 * Creates a query node that evaluates to the value of a field, and optionally maps that value using a mapping function
 * Complex field lookups are cached for the mapping function.
 * If a mapping function is specified and the field lookup is complex, wraps the value in a variable.
 */
export function createNonListFieldValueNode(params: {field: GraphQLField<any, any>, parentType: GraphQLObjectType, objectNode: QueryNode, innerNodeFn?: (valueNode: QueryNode) => QueryNode }) {
    params.innerNodeFn = params.innerNodeFn || (a => a);

    function mapInnerFn(node: QueryNode) {
        if (params.innerNodeFn) {
            return params.innerNodeFn(node);
        }
        return node;
    }

    function mapInnerFnWithVariable(node: QueryNode) {
        if (params.innerNodeFn) {
            return VariableAssignmentQueryNode.create(node, params.innerNodeFn, params.field.name);
        }
        return node;
    }

    if (isListType(params.field.type)) {
        throw new Error(`Type of ${params.field} is unexpectedly a list type`);
    }
    if (isRelationField(params.field)) {
        return mapInnerFnWithVariable(createTo1RelationNode(params.field, params.parentType, params.objectNode));
    }
    if (isReferenceField(params.field)) {
        return mapInnerFnWithVariable(createTo1ReferenceNode(params.field, params.objectNode));
    }
    if (isRootEntityType(params.parentType) && params.field.name == ID_FIELD) {
        return mapInnerFn(new RootEntityIDQueryNode(params.objectNode));
    }
    return mapInnerFn(new FieldQueryNode(params.objectNode, params.field));
}

export function createTo1RelationNode(field: GraphQLField<any, any>, parentType: GraphQLObjectType, objectNode: QueryNode): QueryNode {
    const edgeType = getEdgeType(parentType, field);
    const followNode = new FollowEdgeQueryNode(edgeType, objectNode, edgeType.getRelationFieldEdgeSide(field));
    return new FirstOfListQueryNode(followNode);
}

export function createTo1ReferenceNode(field: GraphQLField<any, any>, objectNode: QueryNode): QueryNode {
    const referencedEntityType = getNamedType(field.type) as GraphQLObjectType;
    const keyFieldInReferencedEntity = getSingleKeyField(referencedEntityType);
    if (!keyFieldInReferencedEntity) {
        throw new Error(`Type ${referencedEntityType} referenced in field ${field.name} does not declare a single key field`);
    }

    const keyNode = new FieldQueryNode(objectNode, field);
    const listItemVar = new VariableQueryNode(field.name);
    const filterNode = new BinaryOperationQueryNode(
        new FieldQueryNode(listItemVar, keyFieldInReferencedEntity),
        BinaryOperator.EQUAL,
        keyNode
    );

    const listNode = new EntitiesQueryNode(referencedEntityType);
    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode,
        maxCount: 1,
        itemVariable: listItemVar
    });
    return new FirstOfListQueryNode(filteredListNode);
}
