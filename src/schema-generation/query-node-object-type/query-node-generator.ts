import { FieldRequest, FieldSelection } from '../../graphql/query-distiller';
import { BasicType, ConditionalQueryNode, NullQueryNode, ObjectQueryNode, PreExecQueryParms, PropertySpecification, QueryNode, TransformListQueryNode, TypeCheckQueryNode, VariableAssignmentQueryNode, VariableQueryNode, WithPreExecutionQueryNode } from '../../query-tree';
import { decapitalize } from '../../utils/utils';
import { QueryNodeField, QueryNodeObjectType } from './definition';
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

const typeFieldMaps = new WeakMap<QueryNodeObjectType, Map<string, QueryNodeField>>();

function getFieldMap(type: QueryNodeObjectType) {
    let fieldMap = typeFieldMaps.get(type);
    if (fieldMap) {
        return fieldMap;
    }
    fieldMap = new Map(resolveThunk(type.fields).map((f): [string, QueryNodeField] => [f.name, f]));
    typeFieldMaps.set(type, fieldMap);
    return fieldMap;
}

function buildObjectQueryNode(sourceNode: QueryNode, type: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>, fieldRequestStack: ReadonlyArray<FieldRequest>) {
    const fieldMap = getFieldMap(type);
    return new ObjectQueryNode(selectionSet.map(sel => {
        const field = fieldMap.get(sel.fieldRequest.fieldName);
        if (!field) {
            throw new Error(`Missing field ${sel.fieldRequest.fieldName}`);
        }
        const fieldQueryNode = buildFieldQueryNode(sourceNode, field, sel.fieldRequest, fieldRequestStack);
        return new PropertySpecification(sel.propertyName, fieldQueryNode);
    }));
}

function buildFieldQueryNode(sourceNode: QueryNode, field: QueryNodeField, fieldRequest: FieldRequest, fieldRequestStack: ReadonlyArray<FieldRequest>): QueryNode {
    const node = buildFieldQueryNode0(sourceNode, field, fieldRequest, fieldRequestStack);
    if (!field.isSerial) {
        return node;
    }

    const variableNode = new VariableQueryNode(field.name);
    return new WithPreExecutionQueryNode({
        preExecQueries: [
            new PreExecQueryParms({
                query: node,
                resultVariable: variableNode
            })
        ],
        resultNode: variableNode
    });
}

function buildFieldQueryNode0(sourceNode: QueryNode, field: QueryNodeField, fieldRequest: FieldRequest, fieldRequestStack: ReadonlyArray<FieldRequest>): QueryNode {
    const newFieldRequestStack = [
        ...fieldRequestStack,
        fieldRequest
    ];
    const fieldQueryNode = field.resolve(sourceNode, fieldRequest.args, {
        fieldRequestStack: newFieldRequestStack
    });

    // see if we need to map the selection set
    const queryTreeObjectType = extractQueryTreeObjectType(field.type);
    if (!queryTreeObjectType) {
        return fieldQueryNode;
    }

    if (isListType(field.type)) {
        // Note: previously, we had a safeguard here that converted non-lists to empty lists
        // This is no longer necessary because createFieldNode() already does this where necessary (only for simple field lookups)
        // All other code should return lists where lists are expected
        return buildTransformListQueryNode(fieldQueryNode, queryTreeObjectType, fieldRequest.selectionSet, newFieldRequestStack);
    }

    // object
    if (field.skipNullCheck) {
        return buildObjectQueryNode(fieldQueryNode, queryTreeObjectType, fieldRequest.selectionSet, newFieldRequestStack);
    } else {
        // This is necessary because we want to return `null` if a field is null, and not pass `null` through as
        // `source`, just as the graphql engine would do, too.
        return buildConditionalObjectQueryNode(fieldQueryNode, queryTreeObjectType, fieldRequest.selectionSet, newFieldRequestStack);
    }
}

function buildTransformListQueryNode(listNode: QueryNode, itemType: QueryNodeObjectType, selectionSet: ReadonlyArray<FieldSelection>, fieldRequestStack: ReadonlyArray<FieldRequest>): QueryNode {
    // if we can, just extend a given TransformListNode so that other cruddl optimizations can operate
    // (e.g. projection indirection)
    if (listNode instanceof TransformListQueryNode && listNode.innerNode === listNode.itemVariable) {
        return new TransformListQueryNode({
            listNode: listNode.listNode,
            itemVariable: listNode.itemVariable,
            filterNode: listNode.filterNode,
            innerNode: buildObjectQueryNode(listNode.itemVariable, itemType, selectionSet, fieldRequestStack),
            maxCount: listNode.maxCount,
            orderBy: listNode.orderBy,
            skip: listNode.skip
        });
    }

    const itemVariable = new VariableQueryNode(itemType.name);
    const innerNode = buildObjectQueryNode(itemVariable, itemType, selectionSet, fieldRequestStack);
    return new TransformListQueryNode({
        listNode,
        innerNode,
        itemVariable
    });
}
