import {BenchmarkConfig, BenchmarkFactories} from "./support/async-bench";
import {takeRandomSample} from "../../src/utils/utils";
import {Database} from "arangojs";
import {
    TestEnvironment,
    initEnvironment,
    getRandomPaperIDsWithAQL,
    addManyPapersWithAQL,
    getSizeFactorForJSONLength,
    addPaper,
    createLargePaper,
    formatBytes
} from "./support/helpers";

function testAddRootEntity(config: {documentLength: number }): BenchmarkConfig {
    const sizeFactor = getSizeFactorForJSONLength(config.documentLength);
    let env: TestEnvironment;
    return {
        name: `Add a document with size of about ${formatBytes(config.documentLength)}`,
        async before() {
            env = await initEnvironment();
        },

        async fn() {
            const id = await addPaper(env, createLargePaper(sizeFactor));
            if (!id) {
                throw new Error('ID missing');
            }
        }
    };
}

function getSelectionSet(config: { onlyFewFields?: boolean }) {
    if (config.onlyFewFields) {
        return `title, id`;
    }
    return `title, id, tags, literatureReferences { title, authors }`;
}

function getOneOfXRootEntities(config: { rootEntitiesInDB: number, documentLength: number, onlyFewFields?: boolean }): BenchmarkConfig {
    let env: TestEnvironment;
    let sampledIDs: number[] = [];
    const sizeFactor = getSizeFactorForJSONLength(config.documentLength);
    return {
        name: `Get ${config.onlyFewFields ? 'two fields of ' : ''} one of ${config.rootEntitiesInDB} root entities of size ${formatBytes(config.documentLength)}`,
        async beforeAll() {
            env = await initEnvironment();
            await addManyPapersWithAQL(env, config.rootEntitiesInDB, createLargePaper(sizeFactor));
        },

        async before({count}) {
            sampledIDs = await getRandomPaperIDsWithAQL(env, count);
        },

        async fn() {
            const id = takeRandomSample(sampledIDs);
            const result = await env.exec(`query($id: ID!) { allPapers(filter:{id: $id}) { ${getSelectionSet(config)} } }`, {
                id
            });
            if (result.allPapers[0].id != id) {
                throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
            }
        }
    };
}

function getAllOfXRootEntities(config: { rootEntities: number, documentLength: number, onlyFewFields?: boolean }): BenchmarkConfig {
    let env: TestEnvironment;
    const sizeFactor = getSizeFactorForJSONLength(config.documentLength);
    return {
        name: `Fetch ${config.onlyFewFields ? 'two fields of ' : ''} all ${config.rootEntities} root entities of size ${formatBytes(config.documentLength)} in a collection})`,
        async beforeAll() {
            env = await initEnvironment();
            await addManyPapersWithAQL(env, config.rootEntities, createLargePaper(sizeFactor));
        },

        async fn() {
            const result = await env.exec(`query { allPapers { ${getSelectionSet(config)} } }`);
            if (result.allPapers.length != config.rootEntities) {
                throw new Error(`Expected ${config.rootEntities} root entities, got ${result.allPapers.length}`);
            }
        }
    };
}

// these will allocate up to a few hundred megabytes each
const benchmarks: BenchmarkFactories = [
    () => testAddRootEntity({documentLength: 100}),
    () => testAddRootEntity({documentLength: 10000}),
    () => testAddRootEntity({documentLength: 1000000}),
    () => testAddRootEntity({documentLength: 10000000}),
    () => testAddRootEntity({documentLength: 100000000}),

    // test fetching from large collection
    () => getOneOfXRootEntities({ rootEntitiesInDB: 1000, documentLength: 100}),
    () => getOneOfXRootEntities({ rootEntitiesInDB: 100000, documentLength: 100}),
    () => getOneOfXRootEntities({ rootEntitiesInDB: 1000000, documentLength: 100}),

    // test fetching large documents
    () => getOneOfXRootEntities({ rootEntitiesInDB: 10, documentLength: 10000}),
    () => getOneOfXRootEntities({ rootEntitiesInDB: 10, documentLength: 1000000}),
    () => getOneOfXRootEntities({ rootEntitiesInDB: 10, documentLength: 10000000}),

    // test fetching large documents partially
    () => getOneOfXRootEntities({ rootEntitiesInDB: 10, documentLength: 10000, onlyFewFields: true}),
    () => getOneOfXRootEntities({ rootEntitiesInDB: 10, documentLength: 1000000, onlyFewFields: true}),
    () => getOneOfXRootEntities({ rootEntitiesInDB: 10, documentLength: 10000000, onlyFewFields: true}),

    // test fetching many documents
    () => getAllOfXRootEntities({ rootEntities: 100, documentLength: 1000}),
    () => getAllOfXRootEntities({ rootEntities: 1000, documentLength: 1000}),
    () => getAllOfXRootEntities({ rootEntities: 10000, documentLength: 1000}),
];

export default benchmarks;