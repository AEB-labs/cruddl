import { FlexSearchLanguage } from '../../model/config';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    BinaryOperatorWithLanguage,
    FlexSearchStartsWithQueryNode,
    OperatorWithLanguageQueryNode,
    QueryNode,
    RuntimeErrorQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator
} from '../../query-tree';

export const noLanguageWasSuppliedError = 'No Language was supplied';

export function not(value: QueryNode): QueryNode {
    return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
}

export const and = binaryOp(BinaryOperator.AND);
export const or = binaryOp(BinaryOperator.OR);

export function binaryOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => {
        return new BinaryOperationQueryNode(lhs, op, rhs);
    };
}

export function binaryNotOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => not(new BinaryOperationQueryNode(lhs, op, rhs));
}

export function binaryOpWithLanguage(op: BinaryOperatorWithLanguage) {
    return (lhs: QueryNode, rhs: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
        if (!flexSearchLanguage) {
            return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
        }
        return new OperatorWithLanguageQueryNode(lhs, op, rhs, flexSearchLanguage);
    };
}

export function binaryNotOpWithLanguage(op: BinaryOperatorWithLanguage) {
    return (lhs: QueryNode, rhs: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
        if (!flexSearchLanguage) {
            return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
        }
        return not(new OperatorWithLanguageQueryNode(lhs, op, rhs, flexSearchLanguage));
    };
}

export function startsWithOp() {
    return (lhs: QueryNode, rhs: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
        return new FlexSearchStartsWithQueryNode(lhs, rhs, flexSearchLanguage);
    };
}

export function notStartsWithOp() {
    return (lhs: QueryNode, rhs: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => {
        return not(new FlexSearchStartsWithQueryNode(lhs, rhs, flexSearchLanguage));
    };
}
