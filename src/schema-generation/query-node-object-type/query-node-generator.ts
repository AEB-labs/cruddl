import { FieldRequest, FieldSelection } from '../../graphql/query-distiller';
import {
    BasicType, ConditionalQueryNode, FollowEdgeQueryNode, ListQueryNode, NullQueryNode, ObjectQueryNode,
    PropertySpecification, QueryNode,
    TransformListQueryNode, TypeCheckQueryNode, VariableAssignmentQueryNode, VariableQueryNode
} from '../../query-tree';
import { decapitalize } from '../../utils/utils';
import { buildSafeListQueryNode } from '../query-node-utils';
import { QueryNodeField, QueryNodeObjectType } from './definition';
import { extractQueryTreeObjectType, isListType, resolveThunk } from './utils';

export function buildSafeObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>) {
    if (sourceNode instanceof ObjectQueryNode) {
        // shortcut, especially useful for namespace nodes where we always pass through an empty object but ignore it
        return buildObjectQueryNode(sourceNode, type, selectionSet);
    }

    const variableNode = new VariableQueryNode(decapitalize(type.name));
    return new VariableAssignmentQueryNode({
        variableNode,
        variableValueNode: sourceNode,
        resultNode: new ConditionalQueryNode(
            new TypeCheckQueryNode(variableNode, BasicType.OBJECT),
            buildObjectQueryNode(variableNode, type, selectionSet),
            new NullQueryNode())
    });
}

export function buildObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>) {
    // TODO build a map of the fields by name somewhere
    return new ObjectQueryNode(selectionSet.map(sel => {
        const field = resolveThunk(type.fields).find(f => f.name == sel.fieldRequest.fieldName);
        if (!field) {
            throw new Error(`Missing field ${sel.fieldRequest.fieldName}`);
        }
        let fieldQueryNode = buildFieldQueryNode(sourceNode, field, sel.fieldRequest);
        const queryTreeObjectType = extractQueryTreeObjectType(field.type);

        // see if we need to map the selection set
        if (queryTreeObjectType) {
            if (isListType(field.type)) {
                fieldQueryNode = buildSafeTransformListQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet);
            } else {
                fieldQueryNode = buildSafeObjectQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet);
            }
        }

        return new PropertySpecification(sel.propertyName, fieldQueryNode);
    }));
}

function buildFieldQueryNode(sourceNode: QueryNode, field: QueryNodeField, fieldRequest: FieldRequest): QueryNode {
    return field.resolve(sourceNode, fieldRequest.args);
}

export function buildSafeTransformListQueryNode(listNode: QueryNode, itemType: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>): QueryNode {
    if (listNode instanceof ListQueryNode || listNode instanceof TransformListQueryNode || listNode instanceof FollowEdgeQueryNode) {
        // shortcut, especially useful if filter, mapping etc. are done separately
        return buildTransformListQueryNode(listNode, itemType, selectionSet);
    }


    const listVar = new VariableQueryNode('list');
    const safeList = buildSafeListQueryNode(listVar);
    const transformedList = buildTransformListQueryNode(listVar, itemType, selectionSet);
    return new VariableAssignmentQueryNode({
        variableNode: listVar,
        variableValueNode: safeList,
        resultNode: transformedList
    });
}

export function buildTransformListQueryNode(listNode: QueryNode, itemType: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>): QueryNode {
    const itemVariable = new VariableQueryNode(itemType.name);
    const innerNode = buildObjectQueryNode(itemVariable, itemType, selectionSet);
    return new TransformListQueryNode({
        listNode,
        innerNode,
        itemVariable
    });
}
