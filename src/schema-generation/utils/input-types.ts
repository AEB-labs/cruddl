import {
    BinaryOperationQueryNode,
    BinaryOperator,
    BinaryOperatorWithAnalyzer,
    FlexSearchStartsWithQueryNode,
    OperatorWithAnalyzerQueryNode,
    QueryNode,
    RuntimeErrorQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
} from '../../query-tree';

export const noAnalyzerWasSuppliedError = 'No Analyzer was supplied';

export function not(value: QueryNode): QueryNode {
    return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
}

export const and = binaryOp(BinaryOperator.AND);
export const or = binaryOp(BinaryOperator.OR);
export const equal = binaryOp(BinaryOperator.EQUAL);

export function binaryOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => {
        return new BinaryOperationQueryNode(lhs, op, rhs);
    };
}

export function binaryNotOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => not(new BinaryOperationQueryNode(lhs, op, rhs));
}

export function binaryOpWithAnaylzer(op: BinaryOperatorWithAnalyzer) {
    return (lhs: QueryNode, rhs: QueryNode, analyzer?: string) => {
        if (!analyzer) {
            return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
        }
        return new OperatorWithAnalyzerQueryNode(lhs, op, rhs, analyzer);
    };
}

export function binaryNotOpWithAnalyzer(op: BinaryOperatorWithAnalyzer) {
    return (lhs: QueryNode, rhs: QueryNode, analyzer?: string) => {
        if (!analyzer) {
            return new RuntimeErrorQueryNode(noAnalyzerWasSuppliedError);
        }
        return not(new OperatorWithAnalyzerQueryNode(lhs, op, rhs, analyzer));
    };
}

export function startsWithOp() {
    return (lhs: QueryNode, rhs: QueryNode, analyzer?: string) => {
        return new FlexSearchStartsWithQueryNode(lhs, rhs, analyzer);
    };
}

export function notStartsWithOp() {
    return (lhs: QueryNode, rhs: QueryNode, analyzer?: string) => {
        return not(new FlexSearchStartsWithQueryNode(lhs, rhs, analyzer));
    };
}
