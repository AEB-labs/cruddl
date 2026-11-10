import { likePatternToRegExp } from '../../../core/utils/like-helpers.js';
import type { Difference } from './differential-runner.js';

/**
 * A difference between the InMemoryAdapter and ArangoDB that is known and not fixed yet
 *
 * The test fails if a difference does not match any of these, and also if one of these does not
 * occur anymore (so fixed issues get removed from this list).
 */
export interface KnownDifference {
    readonly id: string;
    readonly description: string;
    readonly matches: (difference: Difference) => boolean;
}

interface FilterLeaf {
    /** the operator without the field name (e.g. "_not_contains"), "" for equality */
    readonly operator: string;
    readonly value: unknown;
}

const STRING_OPERATOR_PATTERN = /(?:^|_)(not_)?(contains|starts_with|ends_with|like)$/;
const RANGE_OPERATOR_PATTERN = /(?:^|_)(lt|lte|gt|gte)$/;

function getLeaves(filter: unknown): FilterLeaf[] {
    if (Array.isArray(filter)) {
        return filter.flatMap(getLeaves);
    }
    if (filter === null || typeof filter !== 'object') {
        return [];
    }
    return Object.entries(filter).flatMap(([key, value]): FilterLeaf[] => {
        if (key === 'AND' || key === 'OR') {
            return getLeaves(value);
        }
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return getLeaves(value);
        }
        const stringMatch = key.match(STRING_OPERATOR_PATTERN);
        if (stringMatch) {
            return [{ operator: `_${stringMatch[1] ?? ''}${stringMatch[2]}`, value }];
        }
        const rangeMatch = key.match(RANGE_OPERATOR_PATTERN);
        if (rangeMatch) {
            return [{ operator: `_${rangeMatch[1]}`, value }];
        }
        return [{ operator: '', value }];
    });
}

function isStringOperator(operator: string) {
    return STRING_OPERATOR_PATTERN.test(operator);
}

/**
 * Checks if the (non-negated) string operator would match the string "null"
 */
function matchesNullString(operator: string, value: string) {
    const positiveOperator = operator.replace(/^_not_/, '_');
    switch (positiveOperator) {
        case '_contains':
            return 'null'.includes(value);
        case '_starts_with':
            return 'null'.startsWith(value);
        case '_ends_with':
            return 'null'.endsWith(value);
        case '_like':
            return likePatternToRegExp(value).test('null');
        default:
            return false;
    }
}

export const KNOWN_DIFFERENCES: ReadonlyArray<KnownDifference> = [
    {
        id: 'inmemory-string-operators-on-null',
        description:
            'The InMemoryAdapter converts null field values to the string "null" for _contains, ' +
            '_starts_with, _ends_with and _like (String(null)), so e.g. description_starts_with: "" ' +
            'or description_like: "%" match objects without a description. ArangoDB never ' +
            'matches null values with these operators (and matches them with the _not_ variants).',
        matches: (difference) =>
            difference.kind === 'result' &&
            getLeaves(difference.filter).some(
                (leaf) =>
                    isStringOperator(leaf.operator) &&
                    typeof leaf.value === 'string' &&
                    matchesNullString(leaf.operator, leaf.value),
            ),
    },
    {
        id: 'string-operators-with-null-value',
        description:
            'Passing null to _contains, _starts_with, _ends_with or _like (or their _not_ ' +
            'variants) has no defined meaning: ArangoDB treats null like an empty string in some ' +
            'operators, the InMemoryAdapter searches for the string "null", and _like: null ' +
            'generates invalid JavaScript in the InMemoryAdapter ("missing ) after argument list").',
        matches: (difference) =>
            getLeaves(difference.filter).some(
                (leaf) => isStringOperator(leaf.operator) && leaf.value === null,
            ),
    },
    {
        id: 'string-collation',
        description:
            'ArangoDB compares strings with its ICU collation ("alpha" < "Beta"), the ' +
            'InMemoryAdapter by UTF-16 code units ("Beta" < "alpha"). This affects _lt, _lte, _gt ' +
            'and _gte on strings that differ in case.',
        matches: (difference) =>
            difference.kind === 'result' &&
            getLeaves(difference.filter).some(
                (leaf) =>
                    RANGE_OPERATOR_PATTERN.test(leaf.operator) && typeof leaf.value === 'string',
            ),
    },
];
