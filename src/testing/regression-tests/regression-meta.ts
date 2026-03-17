import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseJSONCOrThrow } from '../utils/parse-jsonc-or-throw.js';

interface DatabaseMetaConfig {
    readonly ignore?: boolean;
    readonly versions?: {
        readonly [version: string]: { readonly ignore?: boolean } | undefined;
    };
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
}

export interface ResolvedTestMeta {
    readonly waitForArangoSearch: boolean;
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
        private readonly databaseVersion: string | undefined,
        private readonly nodeVersion: string,
    ) {}

    resolveTestMeta(name: string): ResolvedTestMeta {
        const suiteMeta = this.getSuiteMeta();
        const testMeta = this.getTestMeta(name);
        return {
            waitForArangoSearch:
                testMeta.waitForArangoSearch ?? suiteMeta.waitForArangoSearch ?? false,
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
        if (this.databaseVersion && dbMeta?.versions?.[this.databaseVersion]?.ignore) {
            return true;
        }
        if (meta.node?.versions?.[this.nodeVersion]?.ignore) {
            return true;
        }
        return false;
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
