import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { aql, initEnvironment, TestEnvironment } from './support/helpers';

export async function addManyPapersWithAQL(environment: TestEnvironment, count: number) {
    await environment
        .getDB()
        .query(
            aql`FOR i IN 1..${count} INSERT { title: CONCAT("Test ", RAND()), isPublished: RAND() > 0.5 } IN papers`,
        );
}

function testCountWithoutFilter(config: { rootEntitiesInDB: number }): BenchmarkConfig {
    let env: TestEnvironment;
    return {
        name: `Count all of ${config.rootEntitiesInDB} root entities`,
        async beforeAll() {
            env = await initEnvironment();
            await addManyPapersWithAQL(env, config.rootEntitiesInDB);
        },

        async fn() {
            const result: any = await env.exec(`query { _allPapersMeta { count } }`);
            const count = result._allPapersMeta.count;
            if (!count) {
                throw new Error('Count is missing');
            }
        },
    };
}

function testCountWithFilter(config: { rootEntitiesInDB: number }): BenchmarkConfig {
    let env: TestEnvironment;
    return {
        name: `Count about half of ${config.rootEntitiesInDB} root entities`,
        async beforeAll() {
            env = await initEnvironment();
            await addManyPapersWithAQL(env, config.rootEntitiesInDB);
        },

        async fn() {
            const result: any = await env.exec(
                `query { _allPapersMeta(filter:{isPublished:true}) { count } }`,
            );
            const count = result._allPapersMeta.count;
            if (!count) {
                throw new Error('Count is missing');
            }
        },
    };
}

const benchmarks: BenchmarkFactories = [
    () => testCountWithoutFilter({ rootEntitiesInDB: 1000 }),
    () => testCountWithoutFilter({ rootEntitiesInDB: 1000000 }),
    () => testCountWithFilter({ rootEntitiesInDB: 1000 }),
    () => testCountWithFilter({ rootEntitiesInDB: 1000000 }),
];

export default benchmarks;
