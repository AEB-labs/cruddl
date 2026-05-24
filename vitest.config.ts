import { defineConfig } from 'vitest/config';

// run tests in three phases for optimal feedback speed:
// 1. most tests (fast unit/integration tests)
// 2. regression tests (take ~30s)
// 3. long-running vector integration/performance tests
class ThreePhaseSequencer {
    constructor(_ctx: unknown) {}

    shard(files: any[]): any[] {
        return files;
    }

    sort(files: any[]): any[] {
        const regressionSpecSuffix = 'testing/regression-tests/regressions.spec.ts';
        const vectorLongSuffixes = [
            'vector-index/vector-index-migrations.spec.ts',
            'vector-index/vector-index-performance.spec.ts',
        ];

        const isRegressionFile = (f: any) =>
            typeof f?.moduleId === 'string' && f.moduleId.endsWith(regressionSpecSuffix);
        const isVectorLongFile = (f: any) =>
            typeof f?.moduleId === 'string' &&
            vectorLongSuffixes.some((suffix) => f.moduleId.endsWith(suffix));

        const phase1 = files.filter((f) => !isRegressionFile(f) && !isVectorLongFile(f));
        const phase2 = files.filter(isRegressionFile);
        const phase3 = files.filter(isVectorLongFile);

        return [...phase1, ...phase2, ...phase3];
    }
}

export default defineConfig({
    resolve: {
        alias: {
            graphql: 'graphql/index.js',
        },
    },
    test: {
        environment: 'node',
        isolate: false,
        fileParallelism: false,
        silent: 'passed-only',
        include: ['src/**/*.spec.ts'],
        setupFiles: ['./init.vitest.ts'],
        sequence: {
            sequencer: ThreePhaseSequencer,
        },
    },
});
