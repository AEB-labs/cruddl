import { benchmark, BenchmarkFactories, time } from './async-bench';
import { bold, green, grey, red, yellow } from '../../../src/utils/colors';

const SHOW_CYCLE_INFO = false;

function formatTimings({meanTime, relativeMarginOfError}: { meanTime: number, relativeMarginOfError: number}) {
    return `${(meanTime * 1000).toFixed(3)}ms (±${(relativeMarginOfError*100).toFixed(2)}%)`;
}

function formatElapsedTime({elapsedTime, setUpTime}: { elapsedTime: number, setUpTime: number}) {
    return `${elapsedTime.toFixed()}s elapsed (${(setUpTime / elapsedTime * 100).toFixed()}% for setup)`;
}

interface BenchmarkSuiteResult {
    hasErrors: boolean;
}

async function runAsync(factories: BenchmarkFactories): Promise<BenchmarkSuiteResult> {
    const startTime = time();
    console.log('');
    console.log('Running benchmark suite');
    let index = 1;
    let erroredCount = 0;
    for (const factory of factories) {
        const config = factory();
        console.log('');
        console.log(yellow(bold(`[${index} / ${factories.length}] ${config.name}...`)));
        try {
            const result = await benchmark(config, {
                onCycleDone: cycle => {
                    if (SHOW_CYCLE_INFO) {
                        console.log(grey(`  Cycle ${cycle.index + 1}: ${cycle.iterationCount} iterations, ` +
                        `current estimate: ${formatTimings(cycle.timingsSoFar)} per iteration, ` +
                        `${formatElapsedTime(cycle)}`));
                    }
                }
            });
            console.log(green(`  ${formatTimings(result)}`) + ` per iteration`);
            console.log(`  ${formatElapsedTime(result)} for ${result.iterationCount} iterations in ${result.cycles} cycles`);
        } catch (err) {
            console.error(err.message, err.stack);
            erroredCount++;
        }
        index++;
    }

    const elapsed = time() - startTime;
    const elapsedMinutes = Math.floor(elapsed / 60);
    const elapsedSeconds = Math.floor(elapsed % 60);
    console.log('');
    console.log(`Done.`.bold);
    console.log(`Executed ${factories.length} benchmarks in ${elapsedMinutes} minutes, ${elapsedSeconds} seconds`.bold);
    if (erroredCount) {
        console.log(red(bold(`${erroredCount} benchmarks reported an error.`)));
    }
    console.log('');
    return {
        hasErrors: erroredCount > 0
    };
}

export function runBenchmarks(factories: BenchmarkFactories) {
    runAsync(factories)
        .then((result) => {
            if (result.hasErrors && !process.exitCode) {
                process.exitCode = 1;
            }
        })
        .catch(err => {
            console.log(err.message, err.stack);
            if (!process.exitCode) {
                process.exitCode = 1;
            }
        });
}