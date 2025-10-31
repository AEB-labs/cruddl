import { expect, assert } from 'chai';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import { likePatternToRegExp } from '../../src/database/like-helpers';
import { RegressionSuite, RegressionSuiteOptions } from './regression-suite';
import { getLogger } from 'log4js';

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

    // log levels can only bet set globally in log4js, so we're doing it here
    const trace = process.argv.includes('--log-trace');
    const traceLogNames = ['ArangoDBAdapter', 'InMemoryAdapter', 'query-resolvers'];
    const traceLoggers = traceLogNames.map((name) => getLogger(name));
    const previousLevels = traceLoggers.map((logger) => logger.level);
    beforeEach(async () => {
        if (trace) {
            for (const logger of traceLoggers) {
                logger.level = 'trace';
            }
        }
    });
    afterEach(async () => {
        if (trace) {
            for (let i = 0; i < traceLoggers.length; i++) {
                traceLoggers[i].level = previousLevels[i];
            }
        }
    });

    for (const database of databases) {
        describe(`for ${database}`, async () => {
            for (const suiteName of dirs) {
                const suitePath = resolve(regressionRootDir, suiteName);
                // run npm test -- --save-actual-as-expected to replace the .result file with the actual contents
                // (first npm test run still marked as failure, subsequent runs will pass)
                const options: RegressionSuiteOptions = {
                    saveActualAsExpected: process.argv.includes('--save-actual-as-expected'),
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

                            const result = await suite.runTest(testName);
                            expect(result.actualResult).to.deep.equal(result.expectedResult);

                            for (const aqlResult of result.aql) {
                                const aqlFileName = `regression/${suiteName}/tests/${testName}/aql/${aqlResult.operationName}.aql`;

                                // "actual" is the generated AQL, expected is the file contents
                                // the messages just turn "expected" around to say the file (which should contain the expected AQL)
                                // is *expected* to exist or not, that's why this looks inverted here
                                if (aqlResult.actual !== null && aqlResult.expected === null) {
                                    assert.fail(
                                        `AQL file at "${aqlFileName}" missing (run with --save-actual-as-expected to create it)`,
                                    );
                                } else if (
                                    aqlResult.expected !== null &&
                                    aqlResult.actual === null
                                ) {
                                    assert.fail(
                                        `AQL file at "${aqlFileName}" should not exist because there is no operation called ${aqlResult.operationName} (or it does not produce AQL)`,
                                    );
                                } else {
                                    expect(aqlResult.actual).to.equal(
                                        aqlResult.expected,
                                        `AQL of operation ${aqlResult.operationName} does not match expected AQL in "${aqlFileName}" (run with --save-actual-as-expected to update the file)`,
                                    );
                                }
                            }
                        }).timeout(10000); // travis is sometimes on the slower side
                    }
                });
            }
        });
    }
});
