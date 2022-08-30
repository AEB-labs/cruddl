import { FieldRequest, FieldSelection } from '../../graphql/query-distiller';
import {
    BasicType,
    ConditionalQueryNode,
    FieldQueryNode,
    LiteralQueryNode,
    NullQueryNode,
    ObjectQueryNode,
    PreExecQueryParms,
    PropertySpecification,
    QueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    TypeCheckQueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode,
} from '../../query-tree';
import { groupByEquivalence } from '../../utils/group-by-equivalence';
import { decapitalize, flatMap } from '../../utils/utils';
import { FieldContext, SelectionToken } from './context';
import { QueryNodeField, QueryNodeObjectType } from './definition';
import { extractQueryTreeObjectType, isListTypeIgnoringNonNull, resolveThunk } from './utils';

export function buildConditionalObjectQueryNode(
    sourceNode: QueryNode,
    type: QueryNodeObjectType,
    selectionSet: ReadonlyArray<FieldSelection>,
    context: FieldContext = {
        selectionStack: [],
        selectionTokenStack: [],
        selectionToken: new SelectionToken(),
    },
) {
    if (sourceNode instanceof ObjectQueryNode) {
        // shortcut, especially useful for namespace nodes where we always pass through an empty object but ignore it
        return buildObjectQueryNode(sourceNode, type, selectionSet, context);
    }

    if (sourceNode instanceof NullQueryNode) {
        return NullQueryNode.NULL;
    }

    // if the source node is simple enough, don't store it in a variable
    if (isSimpleFieldAccessOnVariable(sourceNode)) {
        return new ConditionalQueryNode(
            new TypeCheckQueryNode(sourceNode, BasicType.NULL),
            new NullQueryNode(),
            buildObjectQueryNode(sourceNode, type, selectionSet, context),
        );
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
            buildObjectQueryNode(variableNode, type, selectionSet, context),
        ),
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

function buildObjectQueryNode(
    sourceNode: QueryNode,
    type: QueryNodeObjectType,
    selections: ReadonlyArray<FieldSelection>,
    context: FieldContext,
) {
    // de-duplicate pure fields if they are completely identical
    const fieldMap = getFieldMap(type);
    const distinctFieldRequests = groupByEquivalence(selections, (a, b) => {
        const field = fieldMap.get(a.fieldRequest.fieldName);
        if (!field || !field.isPure) {
            return false;
        }
        return a.fieldRequest.equals(b.fieldRequest);
    });
    const variableAssignments: [VariableQueryNode, QueryNode][] = [];
    let resultNode: QueryNode = new ObjectQueryNode(
        flatMap(distinctFieldRequests, (selections) => {
            const fieldRequest = selections[0].fieldRequest;
            if (fieldRequest.fieldName === '__typename') {
                return selections.map(
                    (s) =>
                        new PropertySpecification(
                            s.propertyName,
                            new LiteralQueryNode(fieldRequest.parentType.name),
                        ),
                );
            }

            const field = fieldMap.get(fieldRequest.fieldName);
            if (!field) {
                throw new Error(`Missing field ${fieldRequest.fieldName}`);
            }
            const selectionToken = new SelectionToken();
            const newContext: FieldContext = {
                ...context,
                selectionStack: [...context.selectionStack, selections[0]],
                selectionTokenStack: [...context.selectionTokenStack, selectionToken],
                selectionToken,
            };
            const fieldQueryNode = buildFieldQueryNode(sourceNode, field, fieldRequest, newContext);
            if (selections.length === 1) {
                return [new PropertySpecification(selections[0].propertyName, fieldQueryNode)];
            } else {
                const variableNode = new VariableQueryNode(field.name);
                variableAssignments.push([variableNode, fieldQueryNode]);
                return selections.map(
                    (s) => new PropertySpecification(s.propertyName, variableNode),
                );
            }
        }),
    );
    for (const [variableNode, variableValueNode] of variableAssignments) {
        resultNode = new VariableAssignmentQueryNode({
            variableNode,
            variableValueNode,
            resultNode,
        });
    }
    return resultNode;
}
function buildFieldQueryNodeWithTransform(
    sourceNode: QueryNode,
    field: QueryNodeField,
    fieldRequest: FieldRequest,
    context: FieldContext,
): QueryNode {
    const transformListQueryNode = buildFieldQueryNode0(sourceNode, field, fieldRequest, context);
    if (field.transform) {
        return field.transform(transformListQueryNode, fieldRequest.args, context);
    } else {
        return transformListQueryNode;
    }
}

function buildFieldQueryNode0(
    sourceNode: QueryNode,
    field: QueryNodeField,
    fieldRequest: FieldRequest,
    context: FieldContext,
): QueryNode {
    const fieldQueryNode = field.resolve(sourceNode, fieldRequest.args, context);

    // see if we need to map the selection set
    const queryTreeObjectType = extractQueryTreeObjectType(field.type);
    if (!queryTreeObjectType) {
        return fieldQueryNode;
    }

    if (isListTypeIgnoringNonNull(field.type)) {
        // Note: previously, we had a safeguard here that converted non-lists to empty lists
        // This is no longer necessary because createFieldNode() already does this where necessary (only for simple field lookups)
        // All other code should return lists where lists are expected

        return buildTransformListQueryNode(
            fieldQueryNode,
            queryTreeObjectType,
            fieldRequest.selectionSet,
            context,
        );
    }

    // object
    if (field.skipNullCheck) {
        return buildObjectQueryNode(
            fieldQueryNode,
            queryTreeObjectType,
            fieldRequest.selectionSet,
            context,
        );
    } else {
        // This is necessary because we want to return `null` if a field is null, and not pass `null` through as
        // `source`, just as the graphql engine would do, too.
        return buildConditionalObjectQueryNode(
            fieldQueryNode,
            queryTreeObjectType,
            fieldRequest.selectionSet,
            context,
        );
    }
}

function buildFieldQueryNode(
    sourceNode: QueryNode,
    field: QueryNodeField,
    fieldRequest: FieldRequest,
    context: FieldContext,
): QueryNode {
    const node = buildFieldQueryNodeWithTransform(sourceNode, field, fieldRequest, context);
    if (!field.isSerial) {
        return node;
    }

    const variableNode = new VariableQueryNode(field.name);
    return new WithPreExecutionQueryNode({
        preExecQueries: [
            new PreExecQueryParms({
                query: node,
                resultVariable: variableNode,
            }),
        ],
        resultNode: variableNode,
    });
}

function buildTransformListQueryNode(
    listNode: QueryNode,
    itemType: QueryNodeObjectType,
    selectionSet: ReadonlyArray<FieldSelection>,
    context: FieldContext,
): QueryNode {
    // if we can, just extend a given TransformListNode so that other cruddl optimizations can operate
    // (e.g. projection indirection)
    if (
        listNode instanceof TransformListQueryNode &&
        listNode.innerNode === listNode.itemVariable
    ) {
        return new TransformListQueryNode({
            listNode: listNode.listNode,
            itemVariable: listNode.itemVariable,
            filterNode: listNode.filterNode,
            innerNode: buildObjectQueryNode(listNode.itemVariable, itemType, selectionSet, context),
            maxCount: listNode.maxCount,
            orderBy: listNode.orderBy,
            skip: listNode.skip,
        });
    }

    const itemVariable = new VariableQueryNode(itemType.name);
    const innerNode = buildObjectQueryNode(itemVariable, itemType, selectionSet, context);
    return new TransformListQueryNode({
        listNode,
        innerNode,
        itemVariable,
    });
}

function isSimpleFieldAccessOnVariable(node: QueryNode): boolean {
    return (
        node instanceof VariableQueryNode ||
        (node instanceof FieldQueryNode && isSimpleFieldAccessOnVariable(node.objectNode))
    );
}
