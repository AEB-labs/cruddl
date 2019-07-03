import { QuickSearchLanguage } from '../../model/config';
import { BinaryOperationQueryNode, BinaryOperator, BinaryOperatorWithLanguage, OperatorWithLanguageQueryNode, QueryNode, QuickSearchStartsWithQueryNode, RuntimeErrorQueryNode, UnaryOperationQueryNode, UnaryOperator } from '../../query-tree';


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
    return (lhs: QueryNode, rhs: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
        if (!quickSearchLanguage) {
            return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
        }
        return new OperatorWithLanguageQueryNode(lhs, op, rhs, quickSearchLanguage);
    };
}

export function binaryNotOpWithLanguage(op: BinaryOperatorWithLanguage) {
    return (lhs: QueryNode, rhs: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
        if (!quickSearchLanguage) {
            return new RuntimeErrorQueryNode(noLanguageWasSuppliedError);
        }
        return not(new OperatorWithLanguageQueryNode(lhs, op, rhs, quickSearchLanguage));
    };
}

export function startsWithOp(){
    return (lhs: QueryNode, rhs: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
        return new QuickSearchStartsWithQueryNode(lhs, rhs, quickSearchLanguage);
    };
}

export function notStartsWithOp(){
    return (lhs: QueryNode, rhs: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => {
        return not(new QuickSearchStartsWithQueryNode(lhs, rhs, quickSearchLanguage));
    };
}