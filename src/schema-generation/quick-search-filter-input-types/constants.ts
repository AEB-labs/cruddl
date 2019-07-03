import { QuickSearchLanguage } from '../../model/config';
import { Field } from '../../model/implementation';
import { BinaryOperator, QueryNode, BinaryOperatorWithLanguage } from '../../query-tree';
import { AnyValue } from '../../utils/utils';
import { NUMERIC_FILTER_FIELDS, binaryNotOpWithLanguage, binaryOpWithLanguage, startsWithOp, notStartsWithOp, binaryNotOp, binaryOp } from '../filter-input-types/constants';
import {
    INPUT_FIELD_CONTAINS,
    INPUT_FIELD_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_CONTAINS_ALL_WORDS,
    INPUT_FIELD_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_CONTAINS_ANY_WORD, INPUT_FIELD_CONTAINS_PHRASE,
    INPUT_FIELD_ENDS_WITH,
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_GT,
    INPUT_FIELD_GTE,
    INPUT_FIELD_IN, INPUT_FIELD_LIKE,
    INPUT_FIELD_LT,
    INPUT_FIELD_LTE,
    INPUT_FIELD_NOT,
    INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_NOT_CONTAINS_ALL_WORDS,
    INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_NOT_CONTAINS_ANY_WORD, INPUT_FIELD_NOT_CONTAINS_PHRASE,
    INPUT_FIELD_NOT_ENDS_WITH,
    INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_LIKE,
    INPUT_FIELD_NOT_STARTS_WITH,
    INPUT_FIELD_STARTS_WITH
} from '../../schema/constants';
import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLString } from 'graphql';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLLocalTime } from '../../schema/scalars/local-time';

export const SOME_PREFIX = 'some';

export const and = binaryOp(BinaryOperator.AND);
export const or = binaryOp(BinaryOperator.OR);

export const QUICK_SEARCH_FILTER_OPERATORS: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode, quickSearchLanguage?: QuickSearchLanguage) => QueryNode } = {
    [INPUT_FIELD_EQUAL]: binaryOp(BinaryOperator.EQUAL),
    [INPUT_FIELD_NOT]: binaryOp(BinaryOperator.UNEQUAL),
    [INPUT_FIELD_LT]: binaryOp(BinaryOperator.LESS_THAN),
    [INPUT_FIELD_LTE]: binaryOp(BinaryOperator.LESS_THAN_OR_EQUAL),
    [INPUT_FIELD_GT]: binaryOp(BinaryOperator.GREATER_THAN),
    [INPUT_FIELD_GTE]: binaryOp(BinaryOperator.GREATER_THAN_OR_EQUAL),
    [INPUT_FIELD_IN]: binaryOp(BinaryOperator.IN),
    [INPUT_FIELD_NOT_IN]: binaryNotOp(BinaryOperator.IN),
    [INPUT_FIELD_STARTS_WITH]: startsWithOp(),
    [INPUT_FIELD_NOT_STARTS_WITH]: notStartsWithOp(),
    [INPUT_FIELD_ENDS_WITH]: binaryOp(BinaryOperator.ENDS_WITH),
    [INPUT_FIELD_NOT_ENDS_WITH]: binaryNotOp(BinaryOperator.ENDS_WITH)

};

export const STRING_QUICK_SEARCH_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_NOT,
    INPUT_FIELD_IN,
    INPUT_FIELD_NOT_IN,
    INPUT_FIELD_STARTS_WITH,
    INPUT_FIELD_NOT_STARTS_WITH
];

export const STRING_TEXT_ANALYZER_FILTER_FIELDS = [
    INPUT_FIELD_CONTAINS_ANY_WORD,
    INPUT_FIELD_NOT_CONTAINS_ANY_WORD,
    INPUT_FIELD_CONTAINS_ALL_WORDS,
    INPUT_FIELD_NOT_CONTAINS_ALL_WORDS,
    // INPUT_FIELD_CONTAINS_ANY_PREFIX,
    // INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX,
    INPUT_FIELD_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES,
    INPUT_FIELD_CONTAINS_PHRASE,
    INPUT_FIELD_NOT_CONTAINS_PHRASE
];

const ID_QUICK_SEARCH_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_NOT,
    INPUT_FIELD_IN,
    INPUT_FIELD_NOT_IN
];

export const QUICK_SEARCH_FILTER_FIELDS_BY_TYPE: { [name: string]: string[] } = {
    [GraphQLString.name]: STRING_QUICK_SEARCH_FILTER_FIELDS,
    [GraphQLID.name]: ID_QUICK_SEARCH_FILTER_FIELDS,
    [GraphQLInt.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLFloat.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLDateTime.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLLocalDate.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLLocalTime.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLBoolean.name]: [INPUT_FIELD_EQUAL, INPUT_FIELD_NOT]
};

export const QUICK_SEARCH_FILTER_DESCRIPTIONS: { [name: string]: string | { [typeName: string]: string } } = {
    [INPUT_FIELD_EQUAL]: {
        [GraphQLString.name]: 'Checks if $field equals a specified string, case-sensitively.\n\n' +
        'If an index exists on $field, it can be used.\n\n' +
        'See also `like` for a case-insensitive filter.',

        ['']: 'Checks if $field equals a specified value.\n\n' +
        'If an index exists on $field, it can be used.'
    },

    [INPUT_FIELD_NOT]: {
        [GraphQLString.name]: 'Checks if $field does not equal a specified string, case-sensitively.',

        ['']: 'Checks if $field does not equal a specified value'
    },

    [INPUT_FIELD_STARTS_WITH]: 'Checks if $field starts with a specified string, case-sensitively.\n\n' +
    'Never uses an index. Consider using `like` (with the `%` placeholder) for a case-insensitive filter that can use an index.',

    [INPUT_FIELD_ENDS_WITH]: 'Checks if $field ends with a specified string, case-sensitively.',

    [INPUT_FIELD_CONTAINS]: 'Checks if $field contains a specified string, case-sensitively.',

    [INPUT_FIELD_LIKE]: 'Matches $field against a pattern case-insensitively with the following placeholders:\n\n' +
    '- `%` matches any sequence of characters, including the empty string\n' +
    '- `_` matches exactly one character\n' +
    '- `\\` can be used to escape the placeholders (use `\\\\` for a literal backslash)\n\n' +
    'If an index exists on $field, it can be used for the literal prefix (the part until the first placeholder).',

    [INPUT_FIELD_NOT_LIKE]: 'Checks if $field does *not* match a pattern case-insensitively with the following placeholders:\n\n' +
    '- `%` matches any sequence of characters, including the empty string\n' +
    '- `_` matches exactly one character\n' +
    '- `\\` can be used to escape the placeholders (use `\\\\` for a literal backslash)'
};

export const QUICK_SEARCH_OPERATORS_WITH_LIST_OPERAND = [INPUT_FIELD_IN, INPUT_FIELD_NOT_IN];