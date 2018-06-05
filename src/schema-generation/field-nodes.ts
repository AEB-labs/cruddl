import { RootEntityType } from '../model';
import { Field } from '../model/implementation';
import {
    BasicType,
    BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, EntitiesQueryNode, FieldQueryNode,
    FirstOfListQueryNode,
    FollowEdgeQueryNode, NullQueryNode, QueryNode, RootEntityIDQueryNode, TransformListQueryNode, TypeCheckQueryNode,
    VariableQueryNode
} from '../query-tree';
import { createSafeListQueryNode } from '../query/queries';
import { ID_FIELD } from '../schema/schema-defaults';

export function createFieldNode(field: Field, sourceNode: QueryNode): QueryNode {
    if (field.isList) {
        if (field.isRelation) {
            return createToNRelationNode(field, sourceNode);
        }

        // there are no lists of references

        return createSafeListQueryNode(new FieldQueryNode(sourceNode, field));
    }

    if (field.isRelation) {
        return createTo1RelationNode(field, sourceNode);
    }

    if (field.isReference) {
        return createTo1ReferenceNode(field, sourceNode);
    }

    if (field.declaringType.isRootEntityType && field.isSystemField && field.name == ID_FIELD) {
        return new RootEntityIDQueryNode(sourceNode);
    }

    return new FieldQueryNode(sourceNode, field);
}

function createTo1ReferenceNode(field: Field, sourceNode: QueryNode): QueryNode {
    const referencedEntityType = field.type as RootEntityType;
    const keyFieldInReferencedEntity = referencedEntityType.getKeyFieldOrThrow();

    const keyNode = new FieldQueryNode(sourceNode, field);
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
    const rawNode = new FirstOfListQueryNode(filteredListNode);
    return new ConditionalQueryNode(new TypeCheckQueryNode(keyNode, BasicType.NULL), NullQueryNode.NULL, rawNode);
}

function createTo1RelationNode(field: Field, sourceNode: QueryNode): QueryNode {
    const relation = field.getRelationOrThrow();
    const followNode = new FollowEdgeQueryNode(relation, sourceNode, relation.getFieldSide(field));
    return new FirstOfListQueryNode(followNode);
}

function createToNRelationNode(field: Field, sourceNode: QueryNode): QueryNode {
    const relation = field.getRelationOrThrow();
    return new FollowEdgeQueryNode(relation, sourceNode, relation.getFieldSide(field));
}
