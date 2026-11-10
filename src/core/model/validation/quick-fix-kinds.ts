/**
 * All quick fix kinds, with a description of what quick fixes of this kind do
 *
 * A kind does not depend on the concrete names or values a quick fix changes, so UIs can use it to
 * group quick fixes, or to offer applying all quick fixes of one kind at once.
 */
export const QUICK_FIX_KINDS = {
    SUPPRESS: 'Adds a @suppress directive for the message',

    // compatibility issues
    ADD_MISSING_TYPE: 'Adds a type that is declared in the baseline model',
    ADD_MISSING_FIELD: 'Adds a field that is declared in the baseline model',
    ADD_MISSING_ENUM_VALUE: 'Adds an enum value that is declared in the baseline model',

    // names
    USE_SIMILAR_NAME: 'Replaces a name that does not exist with a similar name that exists',
    FIX_VALUE_CASING: 'Replaces a value with the valid value that only differs in casing',

    // types and fields
    CHANGE_FIELD_TYPE: 'Changes the declared type of a field',
    REMOVE_NON_NULL: 'Removes the "!" from a non-null type',
    REMOVE_REDUNDANT_FIELD: 'Removes a field declaration that is not needed',
    REMOVE_UNUSED_TYPE: 'Removes a type that is not used',
    REMOVE_DIRECTIVE: 'Removes a directive that is not allowed or has no effect',
    INCLUDE_IN_ALL_MODULES: 'Includes a field in all modules of its declaring type',

    // indices
    ADD_INDEX: 'Adds an index on fields of a root entity type',

    // relations
    ADD_RELATION_DIRECTIVE: 'Adds a missing @relation directive',
    USE_RESTRICT_DELETE_ACTION: 'Changes the onDelete action of a relation to RESTRICT',

    // @collect
    USE_AGGREGATION_OPERATOR: 'Changes the aggregation operator of a @collect field',
    ADD_DISTINCT_AGGREGATION: 'Adds "aggregate: DISTINCT" to a @collect field',
    REMOVE_AGGREGATE_ARGUMENT: 'Removes the "aggregate" argument of a @collect field',
    SHORTEN_COLLECT_PATH: 'Removes the last segment of the path of a @collect field',

    // values
    REMOVE_NULL_DEFAULT_VALUE: 'Removes a null value from a list in a @defaultValue',
    CONVERT_VALUE_TYPE: 'Converts a value to the type it needs to have',
    QUOTE_VALUE: 'Puts a YAML value in quotes so it stays a string',

    // flexSearch
    ADD_ORDER_DIRECTION: 'Adds the missing direction to a flexSearch order clause',
    ENABLE_FLEX_SEARCH: 'Enables flexSearch for a root entity type',
    REMOVE_FLEX_SEARCH_DIRECTIVES:
        'Removes @flexSearch and @flexSearchFulltext from all fields of a type',
    REMOVE_INCLUDE_IN_SEARCH: 'Removes "includeInSearch: true" where it has no effect',

    // vector indices
    REMOVE_DUPLICATE_STORED_VALUE:
        'Removes a duplicate path from the storedValues of a vector index',
    SET_N_LISTS: 'Sets nLists of a vector index to match its factory',
    CHANGE_N_PROBE: 'Changes defaultNProbe or maxNProbe of a vector index',

    // i18n
    MOVE_INTO_I18N: 'Moves a localization into the "i18n" property',
    REMOVE_LOCALIZATION: 'Removes a localization for a type, field or value that does not exist',

    // permission profiles
    MATCH_WHOLE_ROLE: 'Changes a regular expression role specifier to match the whole role',
    ALLOW_ROLE_SUFFIX:
        'Changes a regular expression role specifier to explicitly allow additional characters at the end',
    REMOVE_REGEX_FLAGS: 'Removes regular expression flags that have no effect',
} as const;

export type QuickFixKind = keyof typeof QUICK_FIX_KINDS;
