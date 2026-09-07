import { describe, expect, it } from 'vitest';
import type { ActualTransactionStep } from './aql-golden-file.js';
import {
    buildUpdatedAqlGoldenFile,
    getPeakMemoryUsageErrors,
    parseAqlGoldenFile,
    TESTED_ARANGODB_VERSIONS,
    TRANSACTION_STEP_SEPARATOR,
} from './aql-golden-file.js';

// the tested versions change over time, so the tests refer to them by index
const [OLDEST_VERSION] = TESTED_ARANGODB_VERSIONS;
const NEWEST_VERSION = TESTED_ARANGODB_VERSIONS[TESTED_ARANGODB_VERSIONS.length - 1];

function actualStep(query: string, peakMemoryUsage?: number): ActualTransactionStep {
    return { query, peakMemoryUsage };
}

describe('parseAqlGoldenFile', () => {
    it('parses a value without version as the value of all tested versions', () => {
        const steps = parseAqlGoldenFile('RETURN 1\n\n// Peak memory usage: 32768 bytes\n');
        expect(steps.length).to.equal(1);
        expect(steps[0].query).to.equal('RETURN 1');
        expect([...steps[0].peakMemoryUsageByVersion]).to.deep.equal(
            TESTED_ARANGODB_VERSIONS.map((version) => [version, 32768]),
        );
    });

    it('parses values of specific versions', () => {
        const steps = parseAqlGoldenFile(
            `RETURN 1\n\n// Peak memory usage (arangodb ${OLDEST_VERSION}): 65536 bytes\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
        );
        expect(steps[0].query).to.equal('RETURN 1');
        expect(steps[0].peakMemoryUsageByVersion.get(OLDEST_VERSION)).to.equal(65536);
        expect(steps[0].peakMemoryUsageByVersion.get(NEWEST_VERSION)).to.equal(32768);
    });

    it('parses queries without peak memory usage', () => {
        const steps = parseAqlGoldenFile('RETURN 1\n');
        expect(steps[0].query).to.equal('RETURN 1');
        expect(steps[0].peakMemoryUsageByVersion.size).to.equal(0);
    });

    it('parses multiple transaction steps', () => {
        const steps = parseAqlGoldenFile(
            `RETURN 1\n\n// Peak memory usage: 32768 bytes${TRANSACTION_STEP_SEPARATOR}RETURN 2\n\n// Peak memory usage: 0 bytes\n`,
        );
        expect(steps.map((step) => step.query)).to.deep.equal(['RETURN 1', 'RETURN 2']);
        expect(steps[1].peakMemoryUsageByVersion.get(NEWEST_VERSION)).to.equal(0);
    });
});

describe('buildUpdatedAqlGoldenFile', () => {
    it('writes a single value if all tested versions have the same value', () => {
        const content = buildUpdatedAqlGoldenFile({
            actualSteps: [actualStep('RETURN 1', 32768)],
            goldenSteps: parseAqlGoldenFile('RETURN 1\n\n// Peak memory usage: 32768 bytes\n'),
            arangoDBVersion: NEWEST_VERSION,
        });
        expect(content).to.equal('RETURN 1\n\n// Peak memory usage: 32768 bytes\n');
    });

    it('keeps the values of the versions it is not run against', () => {
        const content = buildUpdatedAqlGoldenFile({
            actualSteps: [actualStep('RETURN 1', 32768)],
            goldenSteps: parseAqlGoldenFile('RETURN 1\n\n// Peak memory usage: 65536 bytes\n'),
            arangoDBVersion: NEWEST_VERSION,
        });
        expect(content).to.equal(
            `RETURN 1\n\n// Peak memory usage (arangodb ${OLDEST_VERSION}): 65536 bytes\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
        );
    });

    it('collapses the values again if they no longer differ', () => {
        const content = buildUpdatedAqlGoldenFile({
            actualSteps: [actualStep('RETURN 1', 65536)],
            goldenSteps: parseAqlGoldenFile(
                `RETURN 1\n\n// Peak memory usage (arangodb ${OLDEST_VERSION}): 65536 bytes\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
            ),
            arangoDBVersion: NEWEST_VERSION,
        });
        expect(content).to.equal('RETURN 1\n\n// Peak memory usage: 65536 bytes\n');
    });

    it('discards the values of versions that are not tested anymore', () => {
        const content = buildUpdatedAqlGoldenFile({
            actualSteps: [actualStep('RETURN 1', 32768)],
            goldenSteps: parseAqlGoldenFile(
                `RETURN 1\n\n// Peak memory usage (arangodb 1.2.3): 65536 bytes\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
            ),
            arangoDBVersion: NEWEST_VERSION,
        });
        expect(content).to.equal(
            `RETURN 1\n\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
        );
    });

    it('does not change the recorded values if run against a version that is not tested', () => {
        const goldenFile = 'RETURN 1\n\n// Peak memory usage: 65536 bytes\n';
        const content = buildUpdatedAqlGoldenFile({
            actualSteps: [actualStep('RETURN 1', 32768)],
            goldenSteps: parseAqlGoldenFile(goldenFile),
            arangoDBVersion: '1.2.3',
        });
        expect(content).to.equal(goldenFile);
    });

    it('records a query that has no peak memory usage', () => {
        const content = buildUpdatedAqlGoldenFile({
            actualSteps: [actualStep('RETURN 1')],
            goldenSteps: undefined,
            arangoDBVersion: NEWEST_VERSION,
        });
        expect(content).to.equal('RETURN 1\n');
    });
});

describe('getPeakMemoryUsageErrors', () => {
    function getErrors(goldenFile: string, steps: ReadonlyArray<ActualTransactionStep>) {
        return getPeakMemoryUsageErrors({
            actualSteps: steps,
            goldenSteps: parseAqlGoldenFile(goldenFile),
            arangoDBVersion: NEWEST_VERSION,
        });
    }

    it('reports no errors if the value matches', () => {
        expect(
            getErrors('RETURN 1\n\n// Peak memory usage: 32768 bytes\n', [
                actualStep('RETURN 1', 32768),
            ]),
        ).to.deep.equal([]);
    });

    it('only compares the version it is run against', () => {
        expect(
            getErrors(
                `RETURN 1\n\n// Peak memory usage (arangodb ${OLDEST_VERSION}): 65536 bytes\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
                [actualStep('RETURN 1', 32768)],
            ),
        ).to.deep.equal([]);
    });

    it('reports a changed value', () => {
        expect(
            getErrors('RETURN 1\n\n// Peak memory usage: 32768 bytes\n', [
                actualStep('RETURN 1', 65536),
            ]),
        ).to.deep.equal([
            `Peak memory usage increased from 32768 to 65536 bytes on arangodb ${NEWEST_VERSION}`,
        ]);
    });

    it('reports the transaction step if there are multiple', () => {
        expect(
            getErrors(
                `RETURN 1\n\n// Peak memory usage: 32768 bytes${TRANSACTION_STEP_SEPARATOR}RETURN 2\n\n// Peak memory usage: 32768 bytes\n`,
                [actualStep('RETURN 1', 32768), actualStep('RETURN 2', 0)],
            ),
        ).to.deep.equal([
            `Peak memory usage in transaction step 2 decreased from 32768 to 0 bytes on arangodb ${NEWEST_VERSION}`,
        ]);
    });

    it('reports a missing value', () => {
        expect(getErrors('RETURN 1\n', [actualStep('RETURN 1', 32768)])).to.deep.equal([
            `Peak memory usage is not recorded for arangodb ${NEWEST_VERSION} (it is 32768 bytes)`,
        ]);
    });

    it('reports values of versions that are not tested anymore', () => {
        expect(
            getErrors(
                `RETURN 1\n\n// Peak memory usage (arangodb 1.2.3): 65536 bytes\n// Peak memory usage (arangodb ${NEWEST_VERSION}): 32768 bytes\n`,
                [actualStep('RETURN 1', 32768)],
            ),
        ).to.deep.equal([
            `Peak memory usage is recorded for arangodb 1.2.3, but that version is not tested anymore`,
        ]);
    });

    it('still compares if the query only differs in trailing whitespace', () => {
        // trailing whitespace is removed when the AQL files are written
        expect(
            getErrors('RETURN 1\n\n// Peak memory usage: 32768 bytes\n', [
                actualStep('RETURN 1   ', 65536),
            ]),
        ).to.deep.equal([
            `Peak memory usage increased from 32768 to 65536 bytes on arangodb ${NEWEST_VERSION}`,
        ]);
    });

    it('does not report anything if the query changed', () => {
        expect(
            getErrors('RETURN 1\n\n// Peak memory usage: 32768 bytes\n', [
                actualStep('RETURN 2', 65536),
            ]),
        ).to.deep.equal([]);
    });

    it('does not report anything if run against a version that is not tested', () => {
        expect(
            getPeakMemoryUsageErrors({
                actualSteps: [actualStep('RETURN 1', 65536)],
                goldenSteps: parseAqlGoldenFile('RETURN 1\n\n// Peak memory usage: 32768 bytes\n'),
                arangoDBVersion: '1.2.3',
            }),
        ).to.deep.equal([]);
    });
});
