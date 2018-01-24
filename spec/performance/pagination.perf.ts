import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { aql, initEnvironment, TestEnvironment } from './support/helpers';

export async function addManyPapersWithAQL(environment: TestEnvironment, count: number) {
    await environment.getDB().query(aql`FOR i IN 1..${count} INSERT { title: CONCAT("Test ", RAND()) } IN papers`);
}

function testPagination(config: { pageSize: number, pages: number, rootEntitiesInDB: number, orderBy?: string}): BenchmarkConfig {
    let env: TestEnvironment;
    return {
        name: `Fetch ${config.pages} pages of size ${config.pageSize} from ${config.rootEntitiesInDB} root entities in total` +
            (config.orderBy ? ` ordered by ${config.orderBy}` : ''),
        async beforeAll() {
            env = await initEnvironment();
            await addManyPapersWithAQL(env, config.rootEntitiesInDB);
        },

        async fn() {
            let cursor = null;
            for (let i = 0; i < config.pages ; i++) {
                const result: any = await env.exec(`query($count: Int!, $cursor: String, $orderBy: [PaperOrderBy!]) { allPapers(first: $count, after: $cursor, orderBy: $orderBy) { title, id, _cursor } }`, {
                    count: config.pageSize,
                    cursor,
                    orderBy: config.orderBy
                });
                const lastPaper = result.allPapers[result.allPapers.length - 1];
                if (!lastPaper) {
                    throw new Error(`Page ${i} did not return any items`);
                }
                cursor = lastPaper._cursor;
                if (!cursor) {
                    throw new Error('Cursor is missing');
                }
            }
        }
    };
}

const benchmarks: BenchmarkFactories = [
    () => testPagination({ rootEntitiesInDB: 1000, pageSize: 10, pages: 5}),
    () => testPagination({ rootEntitiesInDB: 10000, pageSize: 10, pages: 5}),
    () => testPagination({ rootEntitiesInDB: 1000000, pageSize: 10, pages: 5}),
    () => testPagination({ rootEntitiesInDB: 10000, pageSize: 10, pages: 5, orderBy: 'title_ASC'}),
    () => testPagination({ rootEntitiesInDB: 10000, pageSize: 10, pages: 5, orderBy: 'title_DESC'}),

    // still slow, covered by https://github.com/arangodb/arangodb/issues/2357
    () => testPagination({ rootEntitiesInDB: 1000000, pageSize: 10, pages: 5, orderBy: 'title_ASC'}),
];

export default benchmarks;