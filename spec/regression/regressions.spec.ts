import * as fs from 'fs';
import * as path from 'path';
import { RegressionSuite, RegressionSuiteOptions } from './regression-suite';
import { expect } from 'chai';

const regressionRootDir = __dirname;

// temporarily test only specific suites
const only: string[] = [];

describe('regression tests', async () => {
    const dirs = fs.readdirSync(regressionRootDir)
        .filter(name=> fs.statSync(path.resolve(regressionRootDir, name)).isDirectory()).filter(dir => only.length === 0 || only.includes(dir));

    const databases: ('in-memory'|'arangodb')[]
        = process.argv.includes('--db=in-memory') ? [ 'in-memory'] : process.argv.includes('--db=arangodb') ? [ 'arangodb' ] : [ 'in-memory', 'arangodb' ];

    for (const database of databases) {
        describe(`for ${database}`, async () => {
            for (const suiteName of dirs) {
                const suitePath = path.resolve(regressionRootDir, suiteName);
                // run npm test -- --save-actual-as-expected to replace the .result file with the actual contents
                // (first npm test run still marked as failure, subsequent runs will pass)
                const options: RegressionSuiteOptions = {
                    saveActualAsExpected: process.argv.includes('--save-actual-as-expected'),
                    trace: process.argv.includes('--log-trace'),
                    database
                    // @MSF TODO filter -> --regression-test / regression test filter, and read here
                };
                const suite = new RegressionSuite(suitePath, options);
                describe(suiteName, async () => {
                    for (const testName of suite.getTestNames()) {
                        it(testName, async function() {
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
