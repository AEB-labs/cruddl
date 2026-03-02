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
        include: ['spec/**/*.spec.ts'],
        setupFiles: ['./spec/init.vitest.ts'],
    },
});
