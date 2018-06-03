import { FieldRequest, FieldSelection } from '../../graphql/query-distiller';
import {
    BasicType, ConditionalQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode,
    TransformListQueryNode, TypeCheckQueryNode, VariableAssignmentQueryNode, VariableQueryNode
} from '../../query-tree';
import { decapitalize } from '../../utils/utils';
import { QueryNodeField, QueryNodeObjectType } from './definition';
import { extractQueryTreeObjectType, isListType, resolveThunk } from './utils';

export function buildConditionalObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>) {
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

function buildObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>) {
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
                // Note: previously, we had a safeguard here that converted non-lists to empty lists
                // This is no longer necessary because createFieldNode() already does this where necessary (only for simple field lookups)
                // All other code should return lists where lists are expected
                fieldQueryNode = buildTransformListQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet);
            } else {
                // This is necessary because we want to return `null` if a field is null, and not pass `null` through as
                // `source`, just as the graphql engine would do, too.
                // It currently also treats non-objects as `null` (just because it's free), but we may move this to
                // createFieldNode() later.
                fieldQueryNode = buildConditionalObjectQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet);
            }
        }

        return new PropertySpecification(sel.propertyName, fieldQueryNode);
    }));
}

function buildFieldQueryNode(sourceNode: QueryNode, field: QueryNodeField, fieldRequest: FieldRequest): QueryNode {
    return field.resolve(sourceNode, fieldRequest.args);
}

function buildTransformListQueryNode(listNode: QueryNode, itemType: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>): QueryNode {
    const itemVariable = new VariableQueryNode(itemType.name);
    const innerNode = buildObjectQueryNode(itemVariable, itemType, selectionSet);
    return new TransformListQueryNode({
        listNode,
        innerNode,
        itemVariable
    });
}
