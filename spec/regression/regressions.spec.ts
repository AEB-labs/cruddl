import * as fs from 'fs';
import * as path from 'path';
import { RegressionSuite } from './regression-suite';
import { TO_EQUAL_JSON_MATCHERS } from '../helpers/equal-json';

const regressionRootDir = __dirname;

describe('regression tests', async () => {
    const dirs = fs.readdirSync(regressionRootDir)
        .filter(name=> fs.statSync(path.resolve(regressionRootDir, name)).isDirectory());

    for (const suiteName of dirs) {
        const suitePath = path.resolve(regressionRootDir, suiteName);
        const suite = new RegressionSuite(suitePath);
        describe(suiteName, () => {
            beforeAll(async () => {
                jasmine.addMatchers(TO_EQUAL_JSON_MATCHERS);
                await suite.setUp();
            });
            for (const testName of suite.getTestNames()) {
                it(testName, async () => {
                    if (!suite.isSetUp) {
                        return;
                    }
                    const { expectedResult, actualResult } = await suite.runTest(testName);
                    (<any>expect(actualResult)).toEqualJSON(expectedResult);
                });
            }
        });
    }
});
