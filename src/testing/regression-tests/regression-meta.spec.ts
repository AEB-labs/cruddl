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

    describe('minVersion and maxVersion', () => {
        it('ignores versions below minVersion, inclusive bound', () => {
            writeSuiteMeta({ databases: { arangodb: { minVersion: '3.12.13' } } });
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 12 })).toBe(true);
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 11, patch: 99 })).toBe(true);
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 13 })).toBe(false);
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 13, patch: 0 })).toBe(false);
            expect(shouldIgnoreSuite('arangodb', { major: 4, minor: 0, patch: 0 })).toBe(false);
        });

        it('ignores versions above maxVersion, inclusive bound', () => {
            writeSuiteMeta({ databases: { arangodb: { maxVersion: '3.12.12' } } });
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 13 })).toBe(true);
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 13, patch: 0 })).toBe(true);
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch: 12 })).toBe(false);
            expect(shouldIgnoreSuite('arangodb', { major: 3, minor: 11, patch: 0 })).toBe(false);
        });

        it('supports a range', () => {
            writeSuiteMeta({
                databases: { arangodb: { minVersion: '3.12.10', maxVersion: '3.12.12' } },
            });
            const ignored = [6, 9, 13].map((patch) =>
                shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch }),
            );
            const notIgnored = [10, 11, 12].map((patch) =>
                shouldIgnoreSuite('arangodb', { major: 3, minor: 12, patch }),
            );
            expect(ignored).toEqual([true, true, true]);
            expect(notIgnored).toEqual([false, false, false]);
        });

        it('does not ignore if the version is unknown', () => {
            writeSuiteMeta({ databases: { arangodb: { minVersion: '3.12.13' } } });
            expect(shouldIgnoreSuite('arangodb', undefined)).toBe(false);
        });

        it('only applies to the database it is configured for', () => {
            writeSuiteMeta({ databases: { arangodb: { minVersion: '3.12.13' } } });
            expect(shouldIgnoreSuite('in-memory', undefined)).toBe(false);
        });

        it('rejects invalid versions even if the version is unknown', () => {
            writeSuiteMeta({ databases: { arangodb: { minVersion: '3.12' } } });
            expect(() => shouldIgnoreSuite('arangodb', undefined)).toThrow(
                'Invalid minVersion "3.12" in meta.json',
            );
            writeSuiteMeta({ databases: { arangodb: { maxVersion: 'latest' } } });
            expect(() => shouldIgnoreSuite('arangodb', undefined)).toThrow(
                'Invalid maxVersion "latest" in meta.json',
            );
        });

        it('works for single tests as well', () => {
            mkdirSync(resolve(suitePath, 'tests', 'a-test'));
            writeFileSync(
                resolve(suitePath, 'tests', 'a-test', 'meta.json'),
                JSON.stringify({ databases: { arangodb: { minVersion: '3.12.13' } } }),
            );
            const meta = (patch: number) =>
                new RegressionMeta(
                    suitePath,
                    resolve(suitePath, 'tests'),
                    'arangodb',
                    { major: 3, minor: 12, patch },
                    '24',
                );
            expect(meta(12).shouldIgnoreTest('a-test')).toBe(true);
            expect(meta(13).shouldIgnoreTest('a-test')).toBe(false);
            expect(meta(12).shouldIgnoreSuite()).toBe(false);
        });
    });
});
