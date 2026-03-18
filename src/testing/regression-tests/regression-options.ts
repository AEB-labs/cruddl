import { likePatternToRegExp } from '../../core/utils/like-helpers.js';

type DatabaseSpecifier = 'in-memory' | 'arangodb';
const ALL_DATABASES: DatabaseSpecifier[] = ['in-memory', 'arangodb'];

export interface RegressionOptions {
    readonly databases: ReadonlyArray<DatabaseSpecifier>;
    readonly testNameFilter: (name: string) => boolean;
    readonly saveActualAsExpected: boolean;
    readonly trace: boolean;
}

/**
 * Reads regression test options from environment variables:
 *
 * - CRUDDL_DB: 'in-memory' | 'arangodb' (default: both)
 * - CRUDDL_REGRESSION_FILTER: glob pattern, e.g. 'logistics/*' (? = single char, * = any)
 * - CRUDDL_UPDATE_EXPECTED: '1' or 'true' to update expected result/AQL files
 * - CRUDDL_TRACE: '1' or 'true' to enable trace logging
 */
export function getRegressionOptions(): RegressionOptions {
    const dbEnv = process.env.CRUDDL_DB;
    let databases: DatabaseSpecifier[];
    if (dbEnv === 'in-memory' || dbEnv === 'arangodb') {
        databases = [dbEnv];
    } else if (dbEnv) {
        throw new Error(`Invalid CRUDDL_DB value: '${dbEnv}'. Expected 'in-memory' or 'arangodb'.`);
    } else {
        databases = ALL_DATABASES;
    }

    const filterPattern = process.env.CRUDDL_REGRESSION_FILTER;
    let testNameFilter: (name: string) => boolean;
    if (filterPattern) {
        const regex = likePatternToRegExp(filterPattern, {
            singleWildcardChar: '?',
            wildcardChar: '*',
        });
        testNameFilter = (name) => regex.test(name);
    } else {
        testNameFilter = () => true;
    }

    return {
        databases,
        testNameFilter,
        saveActualAsExpected: isTruthy(process.env.CRUDDL_UPDATE_EXPECTED),
        trace: isTruthy(process.env.CRUDDL_TRACE),
    };
}

function isTruthy(value: string | undefined): boolean {
    return value === '1' || value === 'true';
}
