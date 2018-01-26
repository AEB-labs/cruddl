import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, FieldQueryNode, FirstOfListQueryNode, ObjectQueryNode,
    OrderClause, OrderSpecification, PropertySpecification, QueryNode, RootEntityIDQueryNode, UnaryOperationQueryNode,
    UnaryOperator, VariableAssignmentQueryNode
} from './definition';

/**
 * Traverses recursively through Unary/Binary operations, extracts all variable definitions and replaces them by their
 * variable nodes
 * @param {QueryNode} node
 * @param variableAssignmentsList: (will be modified) list to which to add the variable assignment nodes
 */
export function extractVariableAssignments(node: QueryNode, variableAssignmentsList: VariableAssignmentQueryNode[]): QueryNode {
    if (node instanceof UnaryOperationQueryNode) {
        return new UnaryOperationQueryNode(extractVariableAssignments(node.valueNode, variableAssignmentsList), node.operator);
    }
    if (node instanceof BinaryOperationQueryNode) {
        return new BinaryOperationQueryNode(
            extractVariableAssignments(node.lhs, variableAssignmentsList),
            node.operator,
            extractVariableAssignments(node.rhs, variableAssignmentsList));
    }
    if (node instanceof VariableAssignmentQueryNode) {
        variableAssignmentsList.push(node);
        return node.resultNode;
    }
    if (node instanceof FirstOfListQueryNode) {
        return new FirstOfListQueryNode(extractVariableAssignments(node.listNode, variableAssignmentsList));
    }
    if (node instanceof FieldQueryNode) {
        return new FieldQueryNode(extractVariableAssignments(node.objectNode, variableAssignmentsList), node.field, node.objectType);
    }
    if (node instanceof RootEntityIDQueryNode) {
        return new RootEntityIDQueryNode(extractVariableAssignments(node.objectNode, variableAssignmentsList));
    }
    if (node instanceof ObjectQueryNode) {
        return new ObjectQueryNode(node.properties.map(p => new PropertySpecification(p.propertyName, extractVariableAssignments(p.valueNode, variableAssignmentsList))));
    }
    return node;
}

/**
 * Wraps a queryNode in a list of variable assignments (the logical counterpart to extractVariableAssignments)
 */
export function prependVariableAssignments(node: QueryNode, variableAssignmentsList: VariableAssignmentQueryNode[]) {
    return variableAssignmentsList.reduce((currentNode, assignmentNode) => new VariableAssignmentQueryNode({
        resultNode: currentNode,
        variableNode: assignmentNode.variableNode,
        variableValueNode: assignmentNode.variableValueNode
    }), node);
}

export function extractVariableAssignmentsInOrderSpecification(orderSpecification: OrderSpecification, variableAssignmentsList: VariableAssignmentQueryNode[]): OrderSpecification {
    return new OrderSpecification(orderSpecification.clauses
        .map(clause => new OrderClause(extractVariableAssignments(clause.valueNode, variableAssignmentsList), clause.direction)));
}

/**
 * Simplifies a boolean expression (does not recurse into non-boolean-related nodes)
 */
export function simplifyBooleans(node: QueryNode): QueryNode {
    if (node instanceof UnaryOperationQueryNode && node.operator == UnaryOperator.NOT) {
        const inner = simplifyBooleans(node.valueNode);
        if (inner instanceof ConstBoolQueryNode) {
            return new ConstBoolQueryNode(!inner.value);
        }
        return new UnaryOperationQueryNode(inner, UnaryOperator.NOT);
    }
    if (node instanceof BinaryOperationQueryNode) {
        const lhs = simplifyBooleans(node.lhs);
        const rhs = simplifyBooleans(node.rhs);
        if (node.operator == BinaryOperator.AND) {
            if (lhs instanceof ConstBoolQueryNode) {
                if (rhs instanceof ConstBoolQueryNode) {
                    // constant evaluation
                    return ConstBoolQueryNode.for(lhs.value && rhs.value);
                }
                if (lhs.value == false) {
                    // FALSE && anything == FALSE
                    return ConstBoolQueryNode.FALSE;
                }
                if (lhs.value == true) {
                    // TRUE && other == other
                    return rhs;
                }
            }
            if (rhs instanceof ConstBoolQueryNode) {
                if (rhs.value == false) {
                    // anything && FALSE == FALSE
                    return ConstBoolQueryNode.FALSE;
                }
                // const case is handled above
                if (rhs.value == true) {
                    // other && TRUE == other
                    return lhs;
                }
            }
        }

        if (node.operator == BinaryOperator.OR) {
            if (lhs instanceof ConstBoolQueryNode) {
                if (rhs instanceof ConstBoolQueryNode) {
                    // constant evaluation
                    return ConstBoolQueryNode.for(lhs.value || rhs.value);
                }
                if (lhs.value == true) {
                    // TRUE || anything == TRUE
                    return ConstBoolQueryNode.TRUE;
                }
                if (lhs.value == false) {
                    // FALSE || other == other
                    return rhs;
                }
            }
            if (rhs instanceof ConstBoolQueryNode) {
                if (rhs.value == true) {
                    // anything || TRUE == TRUE
                    return ConstBoolQueryNode.TRUE;
                }
                if (rhs.value == false) {
                    // other || FALSE == other
                    return lhs;
                }
            }
        }
    }
    return node;
}