import {runBenchmarks} from "./support/runner";
import {default as CRUD} from "./crud.perf";
import {default as PAGINATION} from "./pagination.perf";
import {default as COUNT} from "./count.perf";
import {default as ASSOCIATIONS} from "./associations.perf";
import {default as QUERY_PIPELINE} from "./query-pipeline.perf";

runBenchmarks([
    ...CRUD,
    ...PAGINATION,
    ...COUNT,
    ...ASSOCIATIONS,
    ...QUERY_PIPELINE
]);
