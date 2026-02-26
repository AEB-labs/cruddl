import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            graphql: 'graphql/index.js',
        },
    },
    test: {
        environment: 'node',
        globals: true,
        isolate: false,
        fileParallelism: false,
        silent: 'passed-only',
        include: ['spec/**/*.spec.ts'],
        setupFiles: ['./spec/init.vitest.ts'],
    },
});
