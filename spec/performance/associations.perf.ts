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

async function setUpPapersAndReaders(
    environment: TestEnvironment,
    config: { paperCount: number; userCount: number; associationCount: number },
) {
    await Promise.all([
        addManyPapersWithAQL(environment, config.paperCount, createLargePaper(1)),
        addManyUsersWithAQL(environment, config.paperCount, createUser()),
    ]);

    await environment.getDB().query(aql`
        FOR index
        IN 1..${config.associationCount}
        LET user = FIRST(
          FOR user
          IN users
          SORT RAND()
          LIMIT 1
          RETURN user
        )
        LET paper = FIRST(
          FOR paper
          IN papers
          SORT RAND()
          LIMIT 1
          RETURN paper
        ) 
        INSERT { _from: user._id, _to: paper._id }
        INTO papers_users        
    `);
}

function testFetchWithAssociations(config: {
    paperCount: number;
    userCount: number;
    associationCount: number;
}): BenchmarkConfig {
    let env: TestEnvironment;
    let sampledIDs: ReadonlyArray<string> = [];
    return {
        name: `Fetch one of one root entity with one level deep associations (${config.paperCount} papers, ${config.userCount} users, ${config.associationCount} associations`,
        async beforeAll() {
            env = await initEnvironment();
            await setUpPapersAndReaders(env, config);
        },

        async before({ count }) {
            sampledIDs = await getRandomPaperIDsWithAQL(env, count);
        },

        async fn() {
            const id = takeRandomSample(sampledIDs);
            const result = await env.exec(
                `
            query($id: ID!) { 
                allPapers(filter:{id: $id}) { 
                    id
                    readers(first: 10) {
                        id
                        firstName
                        lastName
                    }
                }
            }`,
                {
                    id,
                },
            );
            if (result.allPapers[0].id != id) {
                throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
            }
        },
    };
}

const benchmarks: BenchmarkFactories = [
    () => testFetchWithAssociations({ paperCount: 1000, userCount: 1000, associationCount: 10000 }),
    () =>
        testFetchWithAssociations({
            paperCount: 100000,
            userCount: 100000,
            associationCount: 1000000,
        }),
    () =>
        testFetchWithAssociations({
            paperCount: 1000000,
            userCount: 1000000,
            associationCount: 1000000,
        }),
];

export default benchmarks;
