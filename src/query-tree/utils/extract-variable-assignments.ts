import {
    BinaryOperationQueryNode,
    ConditionalQueryNode,
    FieldQueryNode,
    FirstOfListQueryNode,
    ObjectQueryNode,
    OrderClause,
    OrderSpecification,
    PropertySpecification,
    QueryNode,
    RootEntityIDQueryNode,
    UnaryOperationQueryNode,
    VariableAssignmentQueryNode,
} from '..';

/**
 * Traverses recursively through Unary/Binary operations, extracts all variable definitions and replaces them by their
 * variable nodes
 * @param {QueryNode} node
 * @param variableAssignmentsList: (will be modified) list to which to add the variable assignment nodes
 */
export function extractVariableAssignments(
    node: QueryNode,
    variableAssignmentsList: VariableAssignmentQueryNode[],
): QueryNode {
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

/**
 * Wraps a queryNode in a list of variable assignments (the logical counterpart to extractVariableAssignments)
 */
export function prependVariableAssignments(
    node: QueryNode,
    variableAssignmentsList: ReadonlyArray<VariableAssignmentQueryNode>,
) {
    return variableAssignmentsList.reduce(
        (currentNode, assignmentNode) =>
            new VariableAssignmentQueryNode({
                resultNode: currentNode,
                variableNode: assignmentNode.variableNode,
                variableValueNode: assignmentNode.variableValueNode,
            }),
        node,
    );
}

export function extractVariableAssignmentsInOrderSpecification(
    orderSpecification: OrderSpecification,
    variableAssignmentsList: VariableAssignmentQueryNode[],
): OrderSpecification {
    return new OrderSpecification(
        orderSpecification.clauses.map(
            (clause) =>
                new OrderClause(
                    extractVariableAssignments(clause.valueNode, variableAssignmentsList),
                    clause.direction,
                ),
        ),
    );
}
