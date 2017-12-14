import * as fs from 'fs';
import * as path from 'path';
import { RegressionSuite, RegressionSuiteOptions } from './regression-suite';
import { TO_EQUAL_JSON_MATCHERS } from '../helpers/equal-json';

const regressionRootDir = __dirname;

// temporarily test only specific suites
const only: string[] = [];

describe('regression tests', async () => {
    const dirs = fs.readdirSync(regressionRootDir)
        .filter(name=> fs.statSync(path.resolve(regressionRootDir, name)).isDirectory()).filter(dir => only.length === 0 || only.includes(dir));

    for (const suiteName of dirs) {
        const suitePath = path.resolve(regressionRootDir, suiteName);
        // run npm test -- --save-actual-as-expected to replace the .result file with the actual contents
        // (first npm test run still marked as failure, subsequent runs will pass)
        const options: RegressionSuiteOptions = {
            saveActualAsExpected: process.argv.includes('--save-actual-as-expected')
        };
        const suite = new RegressionSuite(suitePath, options);
        describe(suiteName, () => {
            beforeAll(async () => {
                jasmine.addMatchers(TO_EQUAL_JSON_MATCHERS);
            });
            for (const testName of suite.getTestNames()) {
                it(testName, async () => {
                    const { expectedResult, actualResult } = await suite.runTest(testName);
                    (<any>expect(actualResult)).toEqualJSON(expectedResult);
                });
            }
        });
    }
});
