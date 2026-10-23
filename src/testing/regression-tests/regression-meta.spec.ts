import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArangoDBVersion } from '../../arangodb/version-helper.js';
import { RegressionMeta } from './regression-meta.js';

describe('RegressionMeta', () => {
    let suitePath: string;

    beforeEach(() => {
        suitePath = mkdtempSync(resolve(tmpdir(), 'regression-meta-'));
        mkdirSync(resolve(suitePath, 'tests'));
    });

    afterEach(() => {
        rmSync(suitePath, { recursive: true, force: true });
    });

    function writeSuiteMeta(meta: unknown) {
        writeFileSync(resolve(suitePath, 'meta.json'), JSON.stringify(meta));
    }

    function shouldIgnoreSuite(database: string, arangoDBVersion: ArangoDBVersion | undefined) {
        return new RegressionMeta(
            suitePath,
            resolve(suitePath, 'tests'),
            database,
            arangoDBVersion,
            '24',
        ).shouldIgnoreSuite();
    }

    it('does not ignore anything without meta.json', () => {
        expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 6 })).toBe(false);
    });

    it('ignores a suite for a whole database', () => {
        writeSuiteMeta({ databases: { 'in-memory': { ignore: true } } });
        expect(shouldIgnoreSuite('in-memory', undefined)).toBe(true);
        expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 6 })).toBe(false);
    });

    it('ignores a suite for a major.minor database version', () => {
        writeSuiteMeta({ databases: { arangodb: { versions: { '3.12': { ignore: true } } } } });
        expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 6 })).toBe(true);
        expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 11 })).toBe(true);
        expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 11, patch: 0 })).toBe(false);
    });

    it('does not ignore by version if the version is unknown', () => {
        writeSuiteMeta({ databases: { arangodb: { versions: { '3.12': { ignore: true } } } } });
        expect(shouldIgnoreSuite('arangodb', undefined)).toBe(false);
    });
});
