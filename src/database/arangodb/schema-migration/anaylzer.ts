import { Database } from 'arangojs';
import { SchemaContext } from '../../../config/global';
import { Logger } from '../../../config/logging';
import { Model, RootEntityType } from '../../../model/implementation';
import { getCollectionNameForRelation, getCollectionNameForRootEntity } from '../arango-basics';
import { ArangoDBConfig, getArangoDBLogger, initDatabase } from '../config';
import { ArangoDBVersionHelper } from '../version-helper';
import { calculateRequiredIndexOperations, getRequiredIndicesFromModel, IndexDefinition } from './index-helpers';
import { CreateDocumentCollectionMigration, CreateEdgeCollectionMigration, CreateIndexMigration, DropIndexMigration, SchemaMigration } from './migrations';

export class SchemaAnalyzer {
    private readonly db: Database;
    private readonly logger: Logger;
    private readonly versionHelper: ArangoDBVersionHelper;

    constructor(config: ArangoDBConfig, schemaContext?: SchemaContext) {
        this.db = initDatabase(config);
        this.versionHelper = new ArangoDBVersionHelper(this.db);
        this.logger = getArangoDBLogger(schemaContext);
    }

    async getOutstandingMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        return [
            ...await this.getDocumentCollectionMigrations(model),
            ...await this.getEdgeCollectionMigrations(model),
            ...await this.getIndexMigrations(model)
        ];
    }

    async getDocumentCollectionMigrations(model: Model): Promise<ReadonlyArray<CreateDocumentCollectionMigration>> {
        // Get existing collections in ArangoDB
        const existingCollections = (await this.db.collections()).filter(coll => (coll as any).type === 2 /* document */);
        ;
        const existingCollectionNames = new Set(existingCollections.map(coll => (<any>coll).name)); // typing for name missing

        const migrations: CreateDocumentCollectionMigration[] = [];

        for (const rootEntity of model.rootEntityTypes) {
            const collectionName = getCollectionNameForRootEntity(rootEntity);
            if (existingCollectionNames.has(collectionName)) {
                continue;
            }
            migrations.push(new CreateDocumentCollectionMigration(rootEntity, collectionName));
        }

        return migrations;
    }

    async getEdgeCollectionMigrations(model: Model): Promise<ReadonlyArray<CreateEdgeCollectionMigration>> {
        // Get existing collections in ArangoDB
        const existingCollections = (await this.db.collections()).filter(coll => (coll as any).type === 3 /* edge */);
        const existingCollectionNames = new Set(existingCollections.map(coll => (<any>coll).name)); // typing for name missing

        const migrations: CreateEdgeCollectionMigration[] = [];

        for (const relation of model.relations) {
            const collectionName = getCollectionNameForRelation(relation);
            if (existingCollectionNames.has(collectionName)) {
                continue;
            }
            migrations.push(new CreateEdgeCollectionMigration(relation, collectionName));
        }

        return migrations;
    }

    async getIndexMigrations(model: Model): Promise<ReadonlyArray<CreateIndexMigration | DropIndexMigration>> {
        const shouldUseWorkaroundForSparseIndices = await this.shouldUseWorkaroundForSparseIndices();

        // update indices
        const requiredIndices = getRequiredIndicesFromModel(model, { shouldUseWorkaroundForSparseIndices });
        const existingIndicesPromises = model.rootEntityTypes.map(rootEntityType => this.getCollectionIndices(rootEntityType));
        let existingIndices: IndexDefinition[] = [];
        await Promise.all(existingIndicesPromises).then(promiseResults => promiseResults.forEach(indices => indices.forEach(index => existingIndices.push(index))));
        const { indicesToDelete, indicesToCreate } = calculateRequiredIndexOperations(existingIndices, requiredIndices);

        // this is useful to show a warning on large collections which would take a while to create an index
        // (or even automatically defer large indices)
        let collectionSizes = new Map<string, number>();
        for (let index of [...indicesToCreate, ...indicesToDelete]) {
            if (!collectionSizes.has(index.collectionName)) {
                let collectionSize;
                try {
                    let countResult = await this.db.collection(index.collectionName).count();
                    collectionSize = countResult.count;
                } catch (e) {
                    // ignore
                }
                collectionSizes.set(index.collectionName, collectionSize);
            }
        }

        return [
            ...indicesToCreate.map(index => new CreateIndexMigration({ index, collectionSize: collectionSizes.get(index.collectionName) })),
            ...indicesToDelete.map(index => new DropIndexMigration({ index, collectionSize: collectionSizes.get(index.collectionName) }))
        ];
    }

    async getCollectionIndices(rootEntityType: RootEntityType): Promise<ReadonlyArray<IndexDefinition>> {
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const coll = this.db.collection(collectionName);
        if (!(await coll.exists())) {
            return [];
        }

        const result = await this.db.collection(collectionName).indexes();
        return result.map((index: any) => {
            return { ...index, rootEntity: rootEntityType, collectionName };
        });
    }

    private async shouldUseWorkaroundForSparseIndices(): Promise<boolean> {
        // arangodb <= 3.2 does not support dynamic usage of sparse indices
        // We use unique indices for @key, and we enable sparse for all unique indices to support multiple NULL values
        // however, this means we can't use the unique index for @reference lookups. To ensure this is still fast
        // (as one would expect for a @reference), we create a non-sparse, non-unique index in addition to the regular
        // unique sparse index.
        let version;
        try {
            version = await this.versionHelper.getArangoDBVersionAsString();
        } catch (e) {
            this.logger.warn(`Error fetching ArangoDB version. Workaround for sparse indices will not be enabled. ` + e.stack);
            return false;
        }
        const parsed = version && this.versionHelper.parseVersion(version);
        if (!parsed) {
            this.logger.warn(`ArangoDB version not recognized ("${version}"). Workaround for sparse indices will not be enabled.`);
            return false;
        }

        const { major, minor } = parsed;
        if ((major > 3) || (major === 3 && minor >= 4)) {
            this.logger.debug(`ArangoDB version: ${version}. Workaround for sparse indices will not be enabled.`);
            return false;
        }
        this.logger.debug(`ArangoDB version: ${version}. Workaround for sparse indices will be enabled.`);
        return true;
    }
}
