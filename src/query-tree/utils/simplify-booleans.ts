import {
    BinaryOperationQueryNode, BinaryOperator, ConstBoolQueryNode, QueryNode, UnaryOperationQueryNode, UnaryOperator
} from '..';

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
