import { default as ASSOCIATIONS } from './associations.perf.js';
import { default as COUNT } from './count.perf.js';
import { default as CRUD } from './crud.perf.js';
import { default as FILTER } from './filter.perf.js';
import { default as PAGINATION } from './pagination.perf.js';
import { default as QUERY_PIPELINE } from './query-pipeline.perf.js';
import { default as REFERENCES } from './references.perf.js';
import { runBenchmarks } from './support/runner.js';

runBenchmarks([
    ...CRUD,
    ...PAGINATION,
    ...COUNT,
    ...REFERENCES,
    ...ASSOCIATIONS,
    ...QUERY_PIPELINE,
    ...FILTER,
]);
