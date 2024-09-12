/**
 * A map of codes to their descriptions
 */
export type MessageCodes = { readonly [code: string]: string };

export const WARNING_CODES = {
    NAMING: 'A naming convention has been violated',

    DEPRECATED: 'A deprecated feature is used',

    UNUSED: 'A type is declared but not used',

    MIRRORED_RELATIONS:
        'Two relations are the exact mirror of each other. A "inverseOf" on one of them might be missing.',

    // Separate from DEPRECATED because this is not planned to be removed yet
    DEPRECATED_REFERENCE: '@reference is used without keyField',

    BOOLEAN_AGGREGATION: 'A @collect field that aggregates booleans in a possibly unintended way',

    UNSUPPORTED_PARENT_FIELD: 'A @parent field that is currently not usable',

    INEFFECTIVE_FLEX_SEARCH:
        '@flexSearch or @flexSearchFulltext is specified but does not have an effect',

    INEFFECTIVE_INCLUDE_IN_SEARCH:
        '@flexSearch(includeInSearch: true) is specified but does not have an effect',

    NO_ROLES: '@roles is specified but no roles are allowed, so access is denied for everyone',

    EMPTY_NAME: 'The empty string is used as a name',

    REDUNDANT_FIELD: 'A field declaration that is not needed',
} as const satisfies MessageCodes;

export type WarningCode = keyof typeof WARNING_CODES;

export const INFO_CODES = {
    NO_TYPE_CHECKS: '@defaultValue currently does not have type checks for the value',
} as const satisfies MessageCodes;

export type InfoCode = keyof typeof INFO_CODES;

export const COMPATIBILITY_ISSUE_CODES = {
    CALC_MUTATIONS: 'Missing @calcMutations operators',
    COLLECT: 'Missing, superfluous or diverging @collect',
    DEFAULT_VALUE: 'Missing, superfluous or diverging @defaultValue',
    MISSING_ENUM_VALUE: 'An enum declaration is missing a value',
    FIELD_TYPE: 'A field has the wrong type',
    KEY_FIELD: 'Missing or superfluous @key',
    REFERENCE: 'Missing, superfluous or diverging @reference',
    RELATION: 'Missing, superfluous or diverging @relation',
    ROOT_FIELD: 'Missing or superfluous @root',
    PARENT_FIELD: 'Missing or superfluous @parent',
    BUSINESS_OBJECT: 'Missing or superfluous @businessObject',
    TYPE_KIND: 'A type declaration is of the wrong kind (e.g. root entity, value object or enum)',
    TTL: 'Missing or superfluous time-to-live configuration',
    FLEX_SEARCH: 'Missing, superfluous or diverging flexSearch configuration on a type or field',

    // this is separate because it's more likely to be intentionally diverging
    FLEX_SEARCH_ORDER: 'Missing, superfluous or diverging flexSearchOrder configuration',

    // this is separate because it's more likely to be intentionally diverging
    FLEX_SEARCH_SEARCH: 'Missing includeInSearch in @flexSearch or @flexSearchFullText',
} as const satisfies MessageCodes;

export type CompatibilityIssueCode = keyof typeof COMPATIBILITY_ISSUE_CODES;

export type MessageCode = WarningCode | InfoCode | CompatibilityIssueCode;
