import { expect } from 'chai';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { likePatternToRegExp } from '../../src/database/like-helpers';
import { RegressionSuite, RegressionSuiteOptions } from './regression-suite';

const regressionRootDir = __dirname;

// temporarily test only specific suites
const only: string[] = [];

describe('regression tests', async () => {
    const dirs = readdirSync(regressionRootDir)
        .filter((name) => statSync(resolve(regressionRootDir, name)).isDirectory())
        .filter((dir) => only.length === 0 || only.includes(dir));

    const databases: ('in-memory' | 'arangodb')[] = process.argv.includes('--db=in-memory')
        ? ['in-memory']
        : process.argv.includes('--db=arangodb')
          ? ['arangodb']
          : ['in-memory', 'arangodb'];

    const filterArg = process.argv.find((arg) => arg.startsWith('--regression-tests='));
    let testNameFilter = (name: string) => true;
    if (filterArg) {
        const pattern = filterArg.substr('--regression-tests='.length);
        const regex = likePatternToRegExp(pattern, { singleWildcardChar: '?', wildcardChar: '*' });
        testNameFilter = (name) => !!name.match(regex);
    }

    for (const database of databases) {
        describe(`for ${database}`, async () => {
            for (const suiteName of dirs) {
                const suitePath = resolve(regressionRootDir, suiteName);
                // run npm test -- --save-actual-as-expected to replace the .result file with the actual contents
                // (first npm test run still marked as failure, subsequent runs will pass)
                const options: RegressionSuiteOptions = {
                    saveActualAsExpected: process.argv.includes('--save-actual-as-expected'),
                    trace: process.argv.includes('--log-trace'),
                    database,
                };
                const suite = new RegressionSuite(suitePath, options);
                describe(suiteName, async () => {
                    const testNames = suite
                        .getTestNames()
                        .filter((testName) => testNameFilter(`${suiteName}/${testName}`));

                    for (const testName of testNames) {
                        it(testName, async function () {
                            if (await suite.shouldIgnoreTest(testName)) {
                                this.skip();
                            }

                            const { expectedResult, actualResult } = await suite.runTest(testName);
                            expect(actualResult).to.deep.equal(expectedResult);
                        }).timeout(10000); // travis is sometimes on the slower side
                    }
                });
            }
        });
    }
});
