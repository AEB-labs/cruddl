import { defineConfig } from 'vitest/config';

// run regression tests last because they take the longest
// (all other tests take ~5s to run, so you get feedback from them very quickly)
class RegressionLastSequencer {
    constructor(_ctx: unknown) {}

    shard(files: any[]): any[] {
        return files;
    }

    sort(files: any[]): any[] {
        const regressionSpecSuffix = '/spec/regression/regressions.spec.ts';

        const nonRegressionFiles = files.filter(
            (file) =>
                typeof file?.moduleId !== 'string' || !file.moduleId.endsWith(regressionSpecSuffix),
        );
        const regressionFiles = files.filter(
            (file) =>
                typeof file?.moduleId === 'string' && file.moduleId.endsWith(regressionSpecSuffix),
        );

        return [...nonRegressionFiles, ...regressionFiles];
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
        include: ['spec/**/*.spec.ts', 'src/**/*.spec.ts'],
        setupFiles: ['./spec/init.vitest.ts'],
        sequence: {
            sequencer: RegressionLastSequencer,
        },
    },
});
