import {
    BinaryOperationQueryNode, BinaryOperator, EntitiesQueryNode, FieldQueryNode, FirstOfListQueryNode,
    FollowEdgeQueryNode, QueryNode, RootEntityIDQueryNode, TransformListQueryNode, VariableAssignmentQueryNode,
    VariableQueryNode
} from './definition';
import { ID_FIELD } from '../schema/schema-defaults';
import { getEdgeType } from '../schema/edges';
import { createSafeListQueryNode } from './queries';
import { Field, ObjectType, RootEntityType, TypeKind } from '../model';

export function createScalarFieldValueNode(objectType: ObjectType, fieldName: string, contextNode: QueryNode): QueryNode {
    const field = objectType.getFieldOrThrow(fieldName);
    if (field.type.isObjectType) {
        throw new Error(`Expected field "${objectType.name}.${fieldName} to be of scalar type, but is ${field.type.kind}`);
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
export function createNonListFieldValueNode(params: {field: Field, parentType: ObjectType, objectNode: QueryNode, innerNodeFn?: (valueNode: QueryNode) => QueryNode }) {
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

    if (params.field.isList) {
        throw new Error(`Type of ${params.field} is unexpectedly a list type`);
    }
    if (params.field.isRelation) {
        return mapInnerFnWithVariable(createTo1RelationNode(params.field, params.objectNode));
    }
    if (params.field.isReference) {
        return mapInnerFnWithVariable(createTo1ReferenceNode(params.field, params.objectNode));
    }
    if (params.parentType.kind == TypeKind.ROOT_ENTITY && params.field.name == ID_FIELD) {
        return mapInnerFn(new RootEntityIDQueryNode(params.objectNode));
    }
    return mapInnerFn(new FieldQueryNode(params.objectNode, params.field));
}

function createTo1RelationNode(field: Field, objectNode: QueryNode): QueryNode {
    const edgeType = getEdgeType(field);
    const followNode = new FollowEdgeQueryNode(edgeType, objectNode, edgeType.getRelationFieldEdgeSide(field));
    return new FirstOfListQueryNode(followNode);
}

function createTo1ReferenceNode(field: Field, objectNode: QueryNode): QueryNode {
    const referencedEntityType = field.type as RootEntityType;
    const keyFieldInReferencedEntity = referencedEntityType.getKeyFieldOrThrow();

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

export function createListFieldValueNode(params: { field: Field, objectNode: QueryNode, parentType: ObjectType}) {
    if (params.field.isRelation) {
        return createToNRelationQueryNode(params.field, params.parentType, params.objectNode);
    }
    if (params.field.isReference) {
        throw new Error(`${params.field.name}: references in lists are not supported yet`);
    }
    return createSafeListQueryNode(new FieldQueryNode(params.objectNode, params.field));
}

function createToNRelationQueryNode(field: Field, parentType: ObjectType, sourceEntityNode: QueryNode): QueryNode {
    const edgeType = getEdgeType(field);
    return new FollowEdgeQueryNode(edgeType, sourceEntityNode, edgeType.getRelationFieldEdgeSide(field));
}
