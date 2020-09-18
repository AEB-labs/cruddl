export const WILDCARD_CHARACTER = '*';

export const ROOT_ENTITY_DIRECTIVE = 'rootEntity';
export const CHILD_ENTITY_DIRECTIVE = 'childEntity';
export const ENTITY_EXTENSION_DIRECTIVE = 'entityExtension';
export const FIELD_DIRECTIVE = 'field';

/**
 * Value object according to DDD. Some people know this kind of type as Composite.
 */
export const VALUE_OBJECT_DIRECTIVE = 'valueObject';

export const RELATION_DIRECTIVE = 'relation';
export const REFERENCE_DIRECTIVE = 'reference';
export const DEFAULT_VALUE_DIRECTIVE = 'defaultValue';
export const FLEX_SEARCH_INDEXED_DIRECTIVE = 'flexSearch';
export const FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE = 'flexSearchFulltext';

export const FLEX_SEARCH_INDEXED_ARGUMENT = 'flexSearch';
export const FLEX_SEARCH_ORDER_ARGUMENT = 'flexSearchOrder';
export const FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT = 'includeInSearch';
export const FLEX_SEARCH_INDEXED_LANGUAGE_ARG = 'language';
export const FLEX_SEARCH_DEFAULT_LANGUAGE_ARG = 'flexSearchLanguage';

export const COLLECT_DIRECTIVE = 'collect';
export const COLLECT_PATH_ARG = 'path';
export const COLLECT_AGGREGATE_ARG = 'aggregate';

export const INVERSE_OF_ARG = 'inverseOf';
export const KEY_FIELD_ARG = 'keyField';

export const QUERY_TYPE = 'Query';
export const MUTATION_TYPE = 'Mutation';
export const QUERY_META_TYPE = '_QueryMeta';

export const ALL_ENTITIES_FIELD_PREFIX = 'all';
export const CREATE_ENTITY_FIELD_PREFIX = 'create';
export const CREATE_ENTITY_TYPE_SUFFIX = 'Input';
export const UPDATE_ENTITY_FIELD_PREFIX = 'update';
export const UPDATE_ALL_ENTITIES_FIELD_PREFIX = 'updateAll';
export const FLEX_SEARCH_ENTITIES_FIELD_PREFIX = 'flexSearch';
export const DELETE_ENTITY_FIELD_PREFIX = 'delete';
export const DELETE_ALL_ENTITIES_FIELD_PREFIX = 'deleteAll';
export const ADD_CHILD_ENTITIES_FIELD_PREFIX = 'add';
export const UPDATE_CHILD_ENTITIES_FIELD_PREFIX = 'update';
export const REMOVE_CHILD_ENTITIES_FIELD_PREFIX = 'remove';
export const CONFIRM_FOR_BILLING_FIELD_PREFIX = 'confirmBillingFor';
export const ADD_EDGES_FIELD_PREFIX = 'add';
export const REMOVE_EDGES_FIELD_PREFIX = 'remove';
export const CREATE_RELATED_ENTITY_FIELD_PREFIX = 'create';

export const ID_FIELD = 'id';
export const ACCESS_GROUP_FIELD = 'accessGroup';
export const ENTITY_CREATED_AT = 'createdAt';
export const ENTITY_UPDATED_AT = 'updatedAt';

export const SCALAR_JSON = 'JSON';
export const SCALAR_INT = 'Int';
export const SCALAR_STRING = 'String';

export const ORDER_BY_ASC_SUFFIX = '_ASC';
export const ORDER_BY_DESC_SUFFIX = '_DESC';

export const FILTER_ARG = 'filter';
export const ORDER_BY_ARG = 'orderBy';

export const FLEX_SEARCH_FILTER_ARG = 'flexSearchFilter';
export const FLEX_SEARCH_EXPRESSION_ARG = 'flexSearchExpression';

export const CURSOR_FIELD = '_cursor';
export const SKIP_ARG = 'skip';
export const AFTER_ARG = 'after';
export const FIRST_ARG = 'first';
export const VALUE_ARG = 'value';
export const KEY_FIELD_DIRECTIVE = 'key';
export const REVISION_FIELD = '_revision';

export const FILTER_FIELD_PREFIX_SEPARATOR = '_';
export const INPUT_FIELD_EQUAL = 'equal';
export const INPUT_FIELD_NOT = 'not';
export const INPUT_FIELD_IN = 'in';
export const INPUT_FIELD_NOT_IN = 'not_in';
export const INPUT_FIELD_LT = 'lt';
export const INPUT_FIELD_LTE = 'lte';
export const INPUT_FIELD_GT = 'gt';
export const INPUT_FIELD_GTE = 'gte';
export const INPUT_FIELD_CONTAINS = 'contains';
export const INPUT_FIELD_NOT_CONTAINS = 'not_contains';
export const INPUT_FIELD_STARTS_WITH = 'starts_with';
export const INPUT_FIELD_NOT_STARTS_WITH = 'not_starts_with';
export const INPUT_FIELD_ENDS_WITH = 'ends_with';
export const INPUT_FIELD_NOT_ENDS_WITH = 'not_ends_with';
export const INPUT_FIELD_LIKE = 'like';
export const INPUT_FIELD_NOT_LIKE = 'not_like';
export const INPUT_FIELD_SOME: 'some' = 'some';
export const INPUT_FIELD_EVERY: 'every' = 'every';
export const INPUT_FIELD_NONE: 'none' = 'none';
export const AND_FILTER_FIELD = 'AND';
export const OR_FILTER_FIELD = 'OR';
export const INPUT_FIELD_CONTAINS_ANY_WORD = 'contains_any_word';
export const INPUT_FIELD_NOT_CONTAINS_ANY_WORD = 'not_contains_any_word';
export const INPUT_FIELD_CONTAINS_ALL_WORDS = 'contains_all_words';
export const INPUT_FIELD_NOT_CONTAINS_ALL_WORDS = 'not_contains_all_words';
export const INPUT_FIELD_CONTAINS_ANY_PREFIX = 'contains_any_prefix';
export const INPUT_FIELD_NOT_CONTAINS_ANY_PREFIX = 'not_contains_any_prefix';
export const INPUT_FIELD_CONTAINS_ALL_PREFIXES = 'contains_all_prefixes';
export const INPUT_FIELD_NOT_CONTAINS_ALL_PREFIXES = 'not_contains_all_prefixes';
export const INPUT_FIELD_CONTAINS_PHRASE = 'contains_phrase';
export const INPUT_FIELD_NOT_CONTAINS_PHRASE = 'not_contains_phrase';

export const CALC_MUTATIONS_DIRECTIVE = 'calcMutations';
export const CALC_MUTATIONS_OPERATORS_ARG = 'operators';
export type CalcMutationOperator = {
    name: 'MULTIPLY' | 'DIVIDE' | 'ADD' | 'SUBTRACT' | 'MODULO' | 'APPEND' | 'PREPEND';
    prefix: string;
    supportedTypes: string[];
};
export const CALC_MUTATIONS_OPERATORS: CalcMutationOperator[] = [
    { name: 'MULTIPLY', prefix: 'multiplyWith_', supportedTypes: ['Int', 'Float'] },
    { name: 'DIVIDE', prefix: 'divideBy_', supportedTypes: ['Int', 'Float'] },
    { name: 'ADD', prefix: 'addTo_', supportedTypes: ['Int', 'Float'] },
    { name: 'SUBTRACT', prefix: 'subtractFrom_', supportedTypes: ['Int', 'Float'] },
    { name: 'MODULO', prefix: 'moduloOf_', supportedTypes: ['Int', 'Float'] },
    { name: 'APPEND', prefix: 'appendTo_', supportedTypes: ['String'] },
    { name: 'PREPEND', prefix: 'prependTo_', supportedTypes: ['String'] }
];

export const COUNT_META_FIELD = 'count';

export const MUTATION_INPUT_ARG = 'input';
export const BILLING_MUTATION_INPUT_ARG = 'id';

export const ROLES_DIRECTIVE = 'roles';
export const ROLES_READ_ARG = 'read';
export const ROLES_READ_WRITE_ARG = 'readWrite';
export const PERMISSION_PROFILE_ARG = 'permissionProfile';

export const DEFAULT_PERMISSION_PROFILE = 'default';

export const OBJECT_TYPE_KIND_DIRECTIVES = [
    ROOT_ENTITY_DIRECTIVE,
    CHILD_ENTITY_DIRECTIVE,
    ENTITY_EXTENSION_DIRECTIVE,
    VALUE_OBJECT_DIRECTIVE
];

export const NAMESPACE_DIRECTIVE = 'namespace';
export const NAMESPACE_NAME_ARG = 'name';
export const NAMESPACE_SEPARATOR = '.';

export const INDICES_DIRECTIVE = 'indices';
export const INDEX_DIRECTIVE = 'index'; // for fields
export const UNIQUE_DIRECTIVE = 'unique'; // for fields
export const INDICES_ARG = INDICES_DIRECTIVE;
export const INDEX_DEFINITION_INPUT_TYPE = 'IndexDefinition';

export const BUSINESS_OBJECT_DIRECTIVE = 'businessObject';
