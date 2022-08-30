import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { takeRandomSample } from '../../src/utils/utils';
import {
    addManyPapersWithAQL,
    addNumberedPapersWithAQL,
    addPaper,
    createLargePaper,
    formatBytes,
    getRandomPaperIDsWithAQL,
    getSizeFactorForJSONLength,
    initEnvironment,
    TestEnvironment,
} from './support/helpers';

function testFilter(config: { rootEntitiesInDB: number; filterSuffix: string }): BenchmarkConfig {
    let env: TestEnvironment;
    return {
        name: `Filter ${config.rootEntitiesInDB} root entities with filter suffix "${config.filterSuffix}" and get one`,
        async beforeAll() {
            env = await initEnvironment();
            await addNumberedPapersWithAQL(env, config.rootEntitiesInDB);
        },

        async fn() {
            const threshold = 'Paper ' + Math.floor(Math.random() * config.rootEntitiesInDB + 1);
            const result = await env.exec(
                `query($threshold: String!) { allPapers(first: 1, filter:{title${config.filterSuffix}: $threshold}) { title id } }`,
                {
                    threshold,
                },
            );
            if (result.allPapers.length !== 1) {
                throw new Error(
                    `Unexpected result: ${JSON.stringify(result)} (threshold: "${threshold}"`,
                );
            }
        },
    };
}

const benchmarks: BenchmarkFactories = [
    () => testFilter({ rootEntitiesInDB: 10000, filterSuffix: '' }),
    () => testFilter({ rootEntitiesInDB: 10000, filterSuffix: '_starts_with' }),
    () => testFilter({ rootEntitiesInDB: 10000, filterSuffix: '_contains' }),

    () => testFilter({ rootEntitiesInDB: 100000, filterSuffix: '' }),
    () => testFilter({ rootEntitiesInDB: 100000, filterSuffix: '_starts_with' }),
    () => testFilter({ rootEntitiesInDB: 100000, filterSuffix: '_contains' }),
];

export default benchmarks;
