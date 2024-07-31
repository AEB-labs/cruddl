import { BenchmarkConfig, BenchmarkFactories } from './support/async-bench';
import { takeRandomSample } from '../../src/utils/utils';
import {
    addManyPapersWithAQL,
    addManyUsersWithAQL,
    aql,
    createLargePaper,
    createUser,
    getRandomPaperIDsWithAQL,
    initEnvironment,
    TestEnvironment,
} from './support/helpers';

async function setUpPapers(
    environment: TestEnvironment,
    config: { startIndex: number; paperCount: number; referenceCountEach: number },
) {
    await environment.getDB().query(aql`
        FOR i IN ${config.startIndex}..${config.startIndex + config.paperCount - 1}
        INSERT {
            key: TO_STRING(i),
            title: CONCAT("Paper ", i),
            literatureReferences: (
                FOR j IN 1..${config.referenceCountEach}
                LET index = FLOOR(RAND() * ${config.paperCount})
                RETURN {
                    paper: TO_STRING(index),
                    title: CONCAT("Paper ", index)
                }   
            )
        } IN papers`);
}

function testReferenceLookup(config: {
    paperCount: number;
    referenceCountEach: number;
}): BenchmarkConfig {
    let env: TestEnvironment;
    let sampledIDs: ReadonlyArray<string> = [];
    return {
        name: `Set up ${config.paperCount} root entities with ${config.referenceCountEach} references each, then fetch a random root entity with all its references`,
        async beforeAll() {
            env = await initEnvironment();
            await setUpPapers(env, { ...config, startIndex: 0, paperCount: 1 });
            await setUpPapers(env, { ...config, startIndex: 1, paperCount: config.paperCount - 1 });
        },

        async before({ count }) {
            sampledIDs = await getRandomPaperIDsWithAQL(env, count);
        },

        async fn() {
            const id = takeRandomSample(sampledIDs);
            const result = await env.exec(
                `
            query($id: ID!) { 
                Paper(id: $id) { 
                    id
                    literatureReferences {
                        title
                        paper {
                            key
                            title
                        }
                    }
                }
            }`,
                {
                    id,
                },
            );
            if (result.Paper.id != id) {
                throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
            }
        },
    };
}

const benchmarks: BenchmarkFactories = [
    () => testReferenceLookup({ paperCount: 1000, referenceCountEach: 50 }),
    () => testReferenceLookup({ paperCount: 100000, referenceCountEach: 50 }),
];

export default benchmarks;
