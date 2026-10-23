import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import type { ArangoDBVersion } from '../../arangodb/version-helper.js';
import { parseJSONCOrThrow } from '../utils/parse-jsonc-or-throw.js';

interface DatabaseMetaConfig {
    readonly ignore?: boolean;
    readonly versions?: {
        readonly [version: string]: { readonly ignore?: boolean } | undefined;
    };

    /** Ignore for database versions below this one (`major.minor.patch`, inclusive bound) */
    readonly minVersion?: string;

    /** Ignore for database versions above this one (`major.minor.patch`, inclusive bound) */
    readonly maxVersion?: string;
}

function parseVersionBound(value: string, field: string): ArangoDBVersion {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    if (!match) {
        throw new Error(`Invalid ${field} "${value}" in meta.json, expected "major.minor.patch"`);
    }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(a: ArangoDBVersion, b: ArangoDBVersion): number {
    return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Shape of `meta.json` files at both suite level and test level.
 *
 * For `ignore` (in `databases` / `node`), suite-level and test-level are independent:
 * suite-level skips the entire suite, test-level skips individual tests.
 *
 * For `waitForArangoSearch`, test-level overrides suite-level.
 */
interface MetaConfig {
    readonly databases?: {
        readonly [database: string]: DatabaseMetaConfig | undefined;
    };
    readonly node?: {
        readonly versions?: {
            readonly [version: string]: { readonly ignore?: boolean } | undefined;
        };
    };
    /** Wait for ArangoSearch views to sync before executing queries (default: false) */
    readonly waitForArangoSearch?: boolean;
    /** Test timeout in milliseconds */
    readonly timeoutInMs?: number;
}

const DEFAULT_TEST_TIMEOUT_IN_MS = 5_000;

export interface ResolvedTestMeta {
    readonly waitForArangoSearch: boolean;
    readonly timeoutInMs: number;
}

function readMeta(filePath: string): MetaConfig {
    if (!existsSync(filePath)) {
        return {};
    }
    return parseJSONCOrThrow<MetaConfig>(readFileSync(filePath, 'utf-8'), filePath);
}

export class RegressionMeta {
    private suiteMeta: MetaConfig | undefined;

    constructor(
        private readonly suitePath: string,
        private readonly testsPath: string,
        private readonly databaseSpecifier: string,
        private readonly arangoDBVersion: ArangoDBVersion | undefined,
        private readonly nodeVersion: string,
    ) {}

    resolveTestMeta(name: string): ResolvedTestMeta {
        const suiteMeta = this.getSuiteMeta();
        const testMeta = this.getTestMeta(name);
        return {
            waitForArangoSearch:
                testMeta.waitForArangoSearch ?? suiteMeta.waitForArangoSearch ?? false,
            timeoutInMs:
                testMeta.timeoutInMs ?? suiteMeta.timeoutInMs ?? DEFAULT_TEST_TIMEOUT_IN_MS,
        };
    }

    shouldIgnoreSuite(): boolean {
        return this.isIgnoredByMeta(this.getSuiteMeta());
    }

    shouldIgnoreTest(name: string): boolean {
        return this.isIgnoredByMeta(this.getTestMeta(name));
    }

    private isIgnoredByMeta(meta: MetaConfig): boolean {
        const dbMeta = meta.databases?.[this.databaseSpecifier];
        if (dbMeta?.ignore) {
            return true;
        }
        if (
            this.arangoDBVersion &&
            this.databaseSpecifier === 'arangodb' &&
            dbMeta?.versions?.[`${this.arangoDBVersion.major}.${this.arangoDBVersion.minor}`]
                ?.ignore
        ) {
            return true;
        }
        if (this.isOutsideVersionRange(dbMeta)) {
            return true;
        }
        if (meta.node?.versions?.[this.nodeVersion]?.ignore) {
            return true;
        }
        return false;
    }

    private isOutsideVersionRange(dbMeta: DatabaseMetaConfig | undefined): boolean {
        if (!dbMeta) {
            return false;
        }
        // validate even if the version is unknown so that typos are found without a server
        const min =
            dbMeta.minVersion !== undefined
                ? parseVersionBound(dbMeta.minVersion, 'minVersion')
                : undefined;
        const max =
            dbMeta.maxVersion !== undefined
                ? parseVersionBound(dbMeta.maxVersion, 'maxVersion')
                : undefined;
        if (!this.arangoDBVersion) {
            return false;
        }
        return (
            (!!min && compareVersions(this.arangoDBVersion, min) < 0) ||
            (!!max && compareVersions(this.arangoDBVersion, max) > 0)
        );
    }

    private getSuiteMeta(): MetaConfig {
        if (!this.suiteMeta) {
            this.suiteMeta = readMeta(resolve(this.suitePath, 'meta.json'));
        }
        return this.suiteMeta;
    }

    private getTestMeta(name: string): MetaConfig {
        return readMeta(resolve(this.testsPath, name, 'meta.json'));
    }
}
