import {BinaryOperator, QueryNode} from "../../query-tree";
import {
    binaryNotOp,
    binaryOp,
    NUMERIC_FILTER_FIELDS,
    Quantifier,
    STRING_FILTER_FIELDS
} from "../filter-input-types/constants";
import {
    INPUT_FIELD_CONTAINS,
    INPUT_FIELD_ENDS_WITH,
    INPUT_FIELD_EQUAL, INPUT_FIELD_EVERY,
    INPUT_FIELD_GT,
    INPUT_FIELD_GTE,
    INPUT_FIELD_IN, INPUT_FIELD_LIKE,
    INPUT_FIELD_LT,
    INPUT_FIELD_LTE, INPUT_FIELD_NONE,
    INPUT_FIELD_NOT,
    INPUT_FIELD_NOT_CONTAINS,
    INPUT_FIELD_NOT_ENDS_WITH,
    INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_LIKE,
    INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_SOME,
    INPUT_FIELD_STARTS_WITH
} from "../../schema/constants";
import {GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLString} from "graphql";
import {GraphQLDateTime} from "../../schema/scalars/date-time";
import {GraphQLLocalDate} from "../../schema/scalars/local-date";
import {GraphQLLocalTime} from "../../schema/scalars/local-time";

export const and = binaryOp(BinaryOperator.AND);

export const QUICK_SEARCH_FILTER_OPERATORS: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode) => QueryNode } = {
    [INPUT_FIELD_EQUAL]: binaryOp(BinaryOperator.EQUAL),
    [INPUT_FIELD_NOT]: binaryOp(BinaryOperator.UNEQUAL),
    [INPUT_FIELD_LT]: binaryOp(BinaryOperator.LESS_THAN),
    [INPUT_FIELD_LTE]: binaryOp(BinaryOperator.LESS_THAN_OR_EQUAL),
    [INPUT_FIELD_GT]: binaryOp(BinaryOperator.GREATER_THAN),
    [INPUT_FIELD_GTE]: binaryOp(BinaryOperator.GREATER_THAN_OR_EQUAL),
    [INPUT_FIELD_IN]: binaryOp(BinaryOperator.IN),
    [INPUT_FIELD_NOT_IN]: binaryNotOp(BinaryOperator.IN),
    [INPUT_FIELD_STARTS_WITH]: binaryOp(BinaryOperator.STARTS_WITH),
    [INPUT_FIELD_NOT_STARTS_WITH]: binaryNotOp(BinaryOperator.STARTS_WITH),
    [INPUT_FIELD_ENDS_WITH]: binaryOp(BinaryOperator.ENDS_WITH),
    [INPUT_FIELD_NOT_ENDS_WITH]: binaryNotOp(BinaryOperator.ENDS_WITH),
};

export const STRING_QUICK_SEARCH_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL, INPUT_FIELD_NOT, INPUT_FIELD_IN, INPUT_FIELD_NOT_IN,
    INPUT_FIELD_STARTS_WITH, INPUT_FIELD_NOT_STARTS_WITH
];
// @MSF TODO: Text analyzer fields


export const QUICK_SEARCH_FILTER_FIELDS_BY_TYPE: { [name: string]: string[] } = {
    [GraphQLString.name]: STRING_QUICK_SEARCH_FILTER_FIELDS,
    [GraphQLID.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLInt.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLFloat.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLDateTime.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLLocalDate.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLLocalTime.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLBoolean.name]: [INPUT_FIELD_EQUAL, INPUT_FIELD_NOT]
};

