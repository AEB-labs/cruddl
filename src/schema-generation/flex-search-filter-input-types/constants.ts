import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLInt, GraphQLString } from 'graphql';
import { FlexSearchLanguage } from '../../model/config';
import { BinaryOperator, QueryNode } from '../../query-tree';
import { INPUT_FIELD_CONTAINS, INPUT_FIELD_CONTAINS_ALL_PREFIXES, INPUT_FIELD_CONTAINS_ALL_WORDS, INPUT_FIELD_CONTAINS_ANY_PREFIX, INPUT_FIELD_CONTAINS_ANY_WORD, INPUT_FIELD_CONTAINS_PHRASE, INPUT_FIELD_ENDS_WITH, INPUT_FIELD_EQUAL, INPUT_FIELD_GT, INPUT_FIELD_GTE, INPUT_FIELD_IN, INPUT_FIELD_LIKE, INPUT_FIELD_LT, INPUT_FIELD_LTE, INPUT_FIELD_NOT, INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES, INPUT_FIELD_NOT_CONTAINS_ALL_WORDS, INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX, INPUT_FIELD_NOT_CONTAINS_ANY_WORD, INPUT_FIELD_NOT_CONTAINS_PHRASE, INPUT_FIELD_NOT_ENDS_WITH, INPUT_FIELD_NOT_IN, INPUT_FIELD_NOT_LIKE, INPUT_FIELD_NOT_STARTS_WITH, INPUT_FIELD_STARTS_WITH } from '../../schema/constants';
import { GraphQLDateTime } from '../../schema/scalars/date-time';
import { GraphQLLocalDate } from '../../schema/scalars/local-date';
import { GraphQLLocalTime } from '../../schema/scalars/local-time';
import { NUMERIC_FILTER_FIELDS } from '../filter-input-types/constants';
import { binaryNotOp, binaryOp, notStartsWithOp, startsWithOp } from '../utils/input-types';


export const SOME_PREFIX = 'some';

export const FLEX_SEARCH_FILTER_OPERATORS: { [suffix: string]: (fieldNode: QueryNode, valueNode: QueryNode, flexSearchLanguage?: FlexSearchLanguage) => QueryNode } = {
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

export const STRING_FLEX_SEARCH_FILTER_FIELDS = [
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

const ID_FLEX_SEARCH_FILTER_FIELDS = [
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_NOT,
    INPUT_FIELD_IN,
    INPUT_FIELD_NOT_IN
];

export const FLEX_SEARCH_FILTER_FIELDS_BY_TYPE: { [name: string]: string[] } = {
    [GraphQLString.name]: STRING_FLEX_SEARCH_FILTER_FIELDS,
    [GraphQLID.name]: ID_FLEX_SEARCH_FILTER_FIELDS,
    [GraphQLInt.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLFloat.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLDateTime.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLLocalDate.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLLocalTime.name]: NUMERIC_FILTER_FIELDS,
    [GraphQLBoolean.name]: [INPUT_FIELD_EQUAL, INPUT_FIELD_NOT]
};

export const FLEX_SEARCH_FILTER_DESCRIPTIONS: { [name: string]: string | { [typeName: string]: string } } = {
    [INPUT_FIELD_EQUAL]: {
        [GraphQLString.name]: 'Checks if $field equals a specified string, case-insensitively.\n\n',
        ['']: 'Checks if $field equals a specified value.\n\n'
    },

    [INPUT_FIELD_NOT]: {
        [GraphQLString.name]: 'Checks if $field does not equal a specified string, case-insensitively.',
        ['']: 'Checks if $field does not equal a specified value'
    },

    [INPUT_FIELD_STARTS_WITH]: 'Checks if $field starts with a specified string, case-insensitively.\n\n',
    [INPUT_FIELD_NOT_STARTS_WITH]: 'Checks if $field does not start with a specified string, case-insensitively.\n\n',
    [INPUT_FIELD_CONTAINS_ANY_WORD]: 'Tokenizes the provided string into words, and checks if $field contains at least one of them.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ANY_WORD]: 'Tokenizes the provided string into words, and checks if $field contains none of them.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_ALL_WORDS]: 'Tokenizes the provided string into words, and checks if $field contains all of them.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ALL_WORDS]: 'Tokenizes the provided string into words, and checks if at least one word is not contained in $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_ANY_PREFIX]: 'Tokenizes the provided string into prefixes, and checks if $field contains any word that starts with one of these prefixes.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX]: 'Tokenizes the provided string into prefixes, and checks if $field does not contain any word that starts with one of these prefixes.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_ALL_PREFIXES]: 'Tokenizes the provided string into prefixes, and checks if all prefixes appears in $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES]: 'Tokenizes the provided prefixes into words, and checks if there is at least one prefix that does not appear in $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_PHRASE]: 'Tokenizes the provided string into words, and checks if that exact phrase (those words in excactly this order) is included in $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_PHRASE]: 'Tokenizes the provided string into words, and checks if that exact phrase (those words in excactly this order) is not included in $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n'

};

export const FLEX_SEARCH_FILTER_DESCRIPTIONS_AGGREGATION: { [name: string]: string | { [typeName: string]: string } } = {
    [INPUT_FIELD_EQUAL]: {
        [GraphQLString.name]: 'Checks if any value in $field equals a specified string, case-insensitively.\n\n',
        ['']: 'Checks if $field equals a specified value.\n\n'
    },

    [INPUT_FIELD_NOT]: {
        [GraphQLString.name]: 'Checks if no value in $field equals a specified string, case-insensitively.',
        ['']: 'Checks if $field does not equal a specified value'
    },

    [INPUT_FIELD_STARTS_WITH]: 'Checks if any value in $field starts with a specified string, case-insensitively.\n\n',
    [INPUT_FIELD_NOT_STARTS_WITH]: 'Checks if none of the values in $field start with a specified string, case-insensitively.\n\n',

    [INPUT_FIELD_CONTAINS_ANY_WORD]: 'Tokenizes the provided string into words, and checks if any value in $field contains at least one of them.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ANY_WORD]: 'Tokenizes the provided string into words, and checks if none of the values in $field contain any of them.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_ALL_WORDS]: 'Tokenizes the provided string into words, and checks if $field contains all of them in any value. ' +
    'The words do not have to appear in the same value, but each word can appear in a different value of this list.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ALL_WORDS]: 'Tokenizes the provided string into words, and checks if at least one word is not contained in any value of $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_ANY_PREFIX]: 'Tokenizes the provided string into prefixes, and checks if any value in $field contains any word that starts with one of these prefixes.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX]: 'Tokenizes the provided string into prefixes, and checks if no value in $field contains any word that starts with one of these prefixes.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_ALL_PREFIXES]: 'Tokenizes the provided string into prefixes, and checks if all prefixes appears in any value of $field.\n ' +
    'The prefixes do not have to appear in the same value, but each prefix can appear in a different value of this list.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES]: 'Tokenizes the provided prefixes into words, and checks if there is at least one prefix that does not appear in any value of $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_CONTAINS_PHRASE]: 'Tokenizes the provided string into words, and checks if that exact phrase (those words in excactly this order) is included in any value of $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n',
    [INPUT_FIELD_NOT_CONTAINS_PHRASE]: 'Tokenizes the provided string into words, and checks if that exact phrase (those words in excactly this order) is not included in any value of $field.\n ' +
    'Stemming (reduction of words on their base form) is applied.\n\n'

};

export const FLEX_SEARCH_OPERATORS_WITH_LIST_OPERAND = [INPUT_FIELD_IN, INPUT_FIELD_NOT_IN];