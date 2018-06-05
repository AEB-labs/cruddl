import { FieldRequest, FieldSelection } from '../../graphql/query-distiller';
import {
    BasicType, ConditionalQueryNode, NullQueryNode, ObjectQueryNode, PropertySpecification, QueryNode,
    TransformListQueryNode, TypeCheckQueryNode, VariableAssignmentQueryNode, VariableQueryNode
} from '../../query-tree';
import { decapitalize } from '../../utils/utils';
import { QueryNodeObjectType } from './definition';
import { extractQueryTreeObjectType, isListType, resolveThunk } from './utils';

export function buildConditionalObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>, fieldRequestStack: ReadonlyArray<FieldRequest> = []) {
    if (sourceNode instanceof ObjectQueryNode) {
        // shortcut, especially useful for namespace nodes where we always pass through an empty object but ignore it
        return buildObjectQueryNode(sourceNode, type, selectionSet, fieldRequestStack);
    }

    if (sourceNode instanceof NullQueryNode) {
        return NullQueryNode.NULL;
    }

    // we don't check for type=object because the source might be something else, like a list or whatever, just null should be treated specially
    // this becomes apparent in the case of the Meta field - it evaluates to a list, and its fields do list operations like COUNT
    const variableNode = new VariableQueryNode(decapitalize(type.name));
    return new VariableAssignmentQueryNode({
        variableNode,
        variableValueNode: sourceNode,
        resultNode: new ConditionalQueryNode(
            new TypeCheckQueryNode(variableNode, BasicType.NULL),
            new NullQueryNode(),
            buildObjectQueryNode(variableNode, type, selectionSet, fieldRequestStack))
    });
}

function buildObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>, fieldRequestStack: ReadonlyArray<FieldRequest>) {
    // TODO build a map of the fields by name somewhere
    return new ObjectQueryNode(selectionSet.map(sel => {
        const field = resolveThunk(type.fields).find(f => f.name == sel.fieldRequest.fieldName);
        if (!field) {
            throw new Error(`Missing field ${sel.fieldRequest.fieldName}`);
        }
        const newFieldRequestStack = [
            ...fieldRequestStack,
            sel.fieldRequest
        ];
        let fieldQueryNode = field.resolve(sourceNode, sel.fieldRequest.args, {
            fieldRequestStack: newFieldRequestStack
        });
        const queryTreeObjectType = extractQueryTreeObjectType(field.type);

        // see if we need to map the selection set
        if (queryTreeObjectType) {
            if (isListType(field.type)) {
                // Note: previously, we had a safeguard here that converted non-lists to empty lists
                // This is no longer necessary because createFieldNode() already does this where necessary (only for simple field lookups)
                // All other code should return lists where lists are expected
                fieldQueryNode = buildTransformListQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet, newFieldRequestStack);
            } else {
                // This is necessary because we want to return `null` if a field is null, and not pass `null` through as
                // `source`, just as the graphql engine would do, too.
                // It currently also treats non-objects as `null` (just because it's free), but we may move this to
                // createFieldNode() later.
                fieldQueryNode = buildConditionalObjectQueryNode(fieldQueryNode, queryTreeObjectType, sel.fieldRequest.selectionSet, newFieldRequestStack);
            }
        }

        return new PropertySpecification(sel.propertyName, fieldQueryNode);
    }));
}

function buildTransformListQueryNode(listNode: QueryNode, itemType: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>, fieldRequestStack: ReadonlyArray<FieldRequest>): QueryNode {
    const itemVariable = new VariableQueryNode(itemType.name);
    const innerNode = buildObjectQueryNode(itemVariable, itemType, selectionSet, fieldRequestStack);
    return new TransformListQueryNode({
        listNode,
        innerNode,
        itemVariable
    });
}
