import { defineConfig } from 'vitest/config';

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
        include: ['spec/**/*.spec.ts'],
        setupFiles: ['./spec/init.vitest.ts'],
        sequence: {
            // Custom sorter to run regressions.spec.ts last
            sorter: (a, b) => {
                const regression = 'spec/regression/regressions.spec.ts';
                if (a.file === regression && b.file !== regression) return 1;
                if (b.file === regression && a.file !== regression) return -1;
                return a.file.localeCompare(b.file);
            },
        },
    },
});
