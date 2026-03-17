import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { getRegressionOptions } from './regression-options.js';
import type { RegressionSuiteOptions } from './regression-suite.js';
import { RegressionSuite } from './regression-suite.js';

const regressionRootDir = __dirname;

// temporarily test only specific suites
const only: string[] = [];

describe('regression tests', async () => {
    const dirs = readdirSync(regressionRootDir)
        .filter((name) => statSync(resolve(regressionRootDir, name)).isDirectory())
        .filter((dir) => only.length === 0 || only.includes(dir));

    const { databases, testNameFilter, saveActualAsExpected, trace } = getRegressionOptions();

    for (const database of databases) {
        describe(`for ${database}`, async () => {
            for (const suiteName of dirs) {
                const suitePath = resolve(regressionRootDir, suiteName);
                const options: RegressionSuiteOptions = {
                    saveActualAsExpected,
                    trace,
                    database,
                };
                const suite = new RegressionSuite(suitePath, options);

                if (suite.shouldIgnoreSuite()) {
                    // not using test.skip() because we don't want to clutter the list of skipped tests
                    // with tests that are just not designed for a specific environment
                    continue;
                }

                describe(suiteName, async () => {
                    const testNames = suite
                        .getTestNames()
                        .filter((testName) => testNameFilter(`${suiteName}/${testName}`));

                    for (const testName of testNames) {
                        if (suite.shouldIgnoreTest(testName)) {
                            continue;
                        }

                        it(testName, { timeout: suite.getTestTimeout(testName) }, async () => {
                            const result = await suite.runTest(testName);
                            expect(result.actualResult).to.deep.equal(result.expectedResult);

                            for (const aqlResult of result.aql) {
                                const aqlFileName = `regression/${suiteName}/tests/${testName}/aql/${aqlResult.operationName}.aql`;

                                // "actual" is the generated AQL, expected is the file contents
                                // the messages just turn "expected" around to say the file (which should contain the expected AQL)
                                // is *expected* to exist or not, that's why this looks inverted here
                                if (aqlResult.actual !== null && aqlResult.expected === null) {
                                    throw new Error(
                                        `AQL file at "${aqlFileName}" missing (run with CRUDDL_UPDATE_EXPECTED=true to create it)`,
                                    );
                                } else if (
                                    aqlResult.expected !== null &&
                                    aqlResult.actual === null
                                ) {
                                    throw new Error(
                                        `AQL file at "${aqlFileName}" should not exist because there is no operation called ${aqlResult.operationName} (or it does not produce AQL)`,
                                    );
                                } else {
                                    expect(aqlResult.actual).to.equal(
                                        aqlResult.expected,
                                        `AQL of operation ${aqlResult.operationName} does not match expected AQL in "${aqlFileName}" (run with CRUDDL_UPDATE_EXPECTED=true to update the file)`,
                                    );
                                }
                            }
                        });
                    }
                });
            }
        });
    }
});
