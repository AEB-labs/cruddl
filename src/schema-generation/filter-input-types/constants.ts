import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLString } from 'graphql';
import {
    BinaryOperationQueryNode, BinaryOperator, QueryNode, UnaryOperationQueryNode, UnaryOperator
} from '../../query-tree';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import {
    INPUT_FIELD_CONTAINS, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_EQUAL, INPUT_FIELD_EVERY, INPUT_FIELD_GT, INPUT_FIELD_GTE,
    INPUT_FIELD_IN, INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_NONE, INPUT_FIELD_NOT, INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH, INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_SOME,
    INPUT_FIELD_STARTS_WITH, SCALAR_DATE, SCALAR_TIME
} from '../../schema/schema-defaults';

export const FILTER_OPERATORS: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
    // not's before the normal fields because they need to be matched first in the suffix-matching algorithm
    [INPUT_FIELD_EQUAL]: binaryOp(BinaryOperator.EQUAL),
    [INPUT_FIELD_NOT]: binaryOp( BinaryOperator.UNEQUAL),
    [INPUT_FIELD_LT]: binaryOp( BinaryOperator.LESS_THAN),
    [INPUT_FIELD_LTE]: binaryOp( BinaryOperator.LESS_THAN_OR_EQUAL),
    [INPUT_FIELD_GT]: binaryOp( BinaryOperator.GREATER_THAN),
    [INPUT_FIELD_GTE]: binaryOp( BinaryOperator.GREATER_THAN_OR_EQUAL),
    [INPUT_FIELD_NOT_IN]: binaryNotOp(BinaryOperator.IN),
    [INPUT_FIELD_IN]: binaryOp( BinaryOperator.IN),
    [INPUT_FIELD_NOT_CONTAINS]: binaryNotOp( BinaryOperator.CONTAINS),
    [INPUT_FIELD_CONTAINS]: binaryOp( BinaryOperator.CONTAINS),
    [INPUT_FIELD_NOT_STARTS_WITH]: binaryNotOp( BinaryOperator.STARTS_WITH),
    [INPUT_FIELD_STARTS_WITH]: binaryOp( BinaryOperator.STARTS_WITH),
    [INPUT_FIELD_NOT_ENDS_WITH]: binaryNotOp( BinaryOperator.ENDS_WITH),
    [INPUT_FIELD_ENDS_WITH]: binaryOp( BinaryOperator.ENDS_WITH)
};

export const NUMERIC_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_IN, INPUT_FIELD_NOT_IN,
    INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_GT, INPUT_FIELD_GTE,
];

export const STRING_FILTER_FIELDS = [INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_IN, INPUT_FIELD_NOT_IN, INPUT_FIELD_LT,
    INPUT_FIELD_LTE, INPUT_FIELD_GT,INPUT_FIELD_GTE, INPUT_FIELD_CONTAINS, INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_STARTS_WITH, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_NOT_ENDS_WITH
];

export const ENUM_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_IN, INPUT_FIELD_NOT_IN
];

export const FILTER_FIELDS_BY_TYPE: {[name: string]: string[]} = {
    [GraphQLString.name]: STRING_FILTER_FIELDS,
    [GraphQLID.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLInt.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLFloat.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLDateTime.name]: NUMERIC_FILTER_FIELDS,
    [SCALAR_DATE]: NUMERIC_FILTER_FIELDS,
    [SCALAR_TIME]: NUMERIC_FILTER_FIELDS,
    [GraphQLBoolean.name]: [ INPUT_FIELD_EQUAL, INPUT_FIELD_NOT],
};

export const QUANTIFIERS = [INPUT_FIELD_SOME, INPUT_FIELD_EVERY, INPUT_FIELD_NONE];

export function not(value: QueryNode): QueryNode {
    return new UnaryOperationQueryNode(value, UnaryOperator.NOT);
}

export const and = binaryOp(BinaryOperator.AND);

export function binaryOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => new BinaryOperationQueryNode(lhs, op, rhs);
}

export function binaryNotOp(op: BinaryOperator) {
    return (lhs: QueryNode, rhs: QueryNode) => not(new BinaryOperationQueryNode(lhs, op, rhs));
}
