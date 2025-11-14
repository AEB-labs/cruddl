import {
    BinaryOperationQueryNode,
    ConditionalQueryNode,
    FieldQueryNode,
    FirstOfListQueryNode,
    HoistableQueryNode,
    ObjectQueryNode,
    OrderClause,
    OrderSpecification,
    PropertySpecification,
    QueryNode,
    RootEntityIDQueryNode,
    UnaryOperationQueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode,
} from '..';

/**
 * Traverses recursively through Unary/Binary operations, extracts all variable definitions and
 * replaces them by their variable nodes
 *
 * The variableAssignmentsList variable will be modified to contain all extracted variable
 * assignments.
 */
export function extractVariableAssignments(
    node: QueryNode,
    variableAssignmentsList: VariableAssignmentQueryNode[],
): QueryNode {
    // TODO aql-perf: figure out if there are real cases where we should extract variables but we don't
    // We don't traverse into loops or other more complex nodes at the moment
    // If we decide to do that in the future, we would need to ensure that we don't extract
    // variables assignments that depend on loop variables, because they can't be extracted out of
    // their loop. One way to do this would be to maintain a set of known variables (with a starter
    // set and newly found assignments), and skip variable assignments that depend on unknown
    // variables.

    if (node instanceof VariableAssignmentQueryNode) {
        // traverse into the variable value node
        const newVariableValueNode = extractVariableAssignments(
            node.variableValueNode,
            variableAssignmentsList,
        );
        if (newVariableValueNode === node.variableValueNode) {
            variableAssignmentsList.push(node);
        } else {
            variableAssignmentsList.push(
                new VariableAssignmentQueryNode({
                    variableNode: node.variableNode,
                    resultNode: node.resultNode,
                    variableValueNode: newVariableValueNode,
                }),
            );
        }
        return extractVariableAssignments(node.resultNode, variableAssignmentsList);
    }

    if (node instanceof HoistableQueryNode) {
        // this is basically an "optional" variable assignment - it should be extracted / hoisted
        // if possible, but otherwise the value will be inline (without variable)
        const variableNode = new VariableQueryNode(node.variableLabel);
        const newInnerNode = extractVariableAssignments(node.node, variableAssignmentsList);
        variableAssignmentsList.push(
            new VariableAssignmentQueryNode({
                variableNode,
                resultNode: variableNode,
                variableValueNode: newInnerNode,
            }),
        );
        return variableNode;
    }

    if (node instanceof UnaryOperationQueryNode) {
        return new UnaryOperationQueryNode(
            extractVariableAssignments(node.valueNode, variableAssignmentsList),
            node.operator,
        );
    }

    if (node instanceof BinaryOperationQueryNode) {
        return new BinaryOperationQueryNode(
            extractVariableAssignments(node.lhs, variableAssignmentsList),
            node.operator,
            extractVariableAssignments(node.rhs, variableAssignmentsList),
        );
    }

    if (node instanceof ConditionalQueryNode) {
        return new ConditionalQueryNode(
            extractVariableAssignments(node.condition, variableAssignmentsList),
            extractVariableAssignments(node.expr1, variableAssignmentsList),
            extractVariableAssignments(node.expr2, variableAssignmentsList),
        );
    }

    if (node instanceof FirstOfListQueryNode) {
        return new FirstOfListQueryNode(
            extractVariableAssignments(node.listNode, variableAssignmentsList),
        );
    }

    if (node instanceof FieldQueryNode) {
        return new FieldQueryNode(
            extractVariableAssignments(node.objectNode, variableAssignmentsList),
            node.field,
        );
    }

    if (node instanceof RootEntityIDQueryNode) {
        return new RootEntityIDQueryNode(
            extractVariableAssignments(node.objectNode, variableAssignmentsList),
        );
    }

    if (node instanceof ObjectQueryNode) {
        return new ObjectQueryNode(
            node.properties.map(
                (p) =>
                    new PropertySpecification(
                        p.propertyName,
                        extractVariableAssignments(p.valueNode, variableAssignmentsList),
                    ),
            ),
        );
    }

    return node;
}
