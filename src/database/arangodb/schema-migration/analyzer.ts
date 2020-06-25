import { Database } from 'arangojs';
import { ProjectOptions } from '../../../config/interfaces';
import { Logger } from '../../../config/logging';
import { Model, RootEntityType } from '../../../model/implementation';
import { billingCollectionName, getCollectionNameForRelation, getCollectionNameForRootEntity } from '../arango-basics';
import { ArangoDBConfig, getArangoDBLogger, initDatabase } from '../config';
import { ArangoDBVersionHelper } from '../version-helper';
import {
    ArangoSearchConfiguration,
    calculateRequiredArangoSearchViewCreateOperations,
    calculateRequiredArangoSearchViewDropOperations,
    calculateRequiredArangoSearchViewUpdateOperations,
    getFlexSearchViewNameForRootEntity,
    getRequiredViewsFromModel
} from './arango-search-helpers';
import {
    calculateRequiredIndexOperations,
    getRequiredIndicesFromModel,
    IndexDefinition,
    isArangoSearchSupported
} from './index-helpers';
import {
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    DropIndexMigration,
    SchemaMigration
} from './migrations';

export class SchemaAnalyzer {
    private readonly db: Database;
    private readonly logger: Logger;
    private readonly versionHelper: ArangoDBVersionHelper;

    constructor(readonly config: ArangoDBConfig, schemaContext?: ProjectOptions) {
        this.db = initDatabase(config);
        this.versionHelper = new ArangoDBVersionHelper(this.db);
        this.logger = getArangoDBLogger(schemaContext);
    }

    async getOutstandingMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        return [
            ...(await this.getDocumentCollectionMigrations(model)),
            ...(await this.getEdgeCollectionMigrations(model)),
            ...(await this.getIndexMigrations(model)),
            ...(await this.getArangoSearchMigrations(model))
        ];
    }

    async getDocumentCollectionMigrations(model: Model): Promise<ReadonlyArray<CreateDocumentCollectionMigration>> {
        // Get existing collections in ArangoDB
        const existingCollections = (await this.db.collections()).filter(
            coll => (coll as any).type === 2 /* document */
        );
        const existingCollectionNames = new Set(existingCollections.map(coll => (<any>coll).name)); // typing for name missing

        const migrations: CreateDocumentCollectionMigration[] = [];

        for (const rootEntity of model.rootEntityTypes) {
            const collectionName = getCollectionNameForRootEntity(rootEntity);
            if (existingCollectionNames.has(collectionName)) {
                continue;
            }
            migrations.push(new CreateDocumentCollectionMigration(collectionName));
        }

        if (
            !existingCollectionNames.has(billingCollectionName) &&
            !migrations.some(value => value.collectionName === billingCollectionName)
        ) {
            migrations.push(new CreateDocumentCollectionMigration(billingCollectionName));
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
        // update indices
        const requiredIndices = getRequiredIndicesFromModel(model);
        const existingIndicesPromises = model.rootEntityTypes.map(rootEntityType =>
            this.getCollectionIndices(rootEntityType)
        );
        let existingIndices: IndexDefinition[] = [];
        await Promise.all(existingIndicesPromises).then(promiseResults =>
            promiseResults.forEach(indices => indices.forEach(index => existingIndices.push(index)))
        );
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
            ...indicesToCreate.map(
                index => new CreateIndexMigration({ index, collectionSize: collectionSizes.get(index.collectionName) })
            ),
            ...indicesToDelete.map(
                index => new DropIndexMigration({ index, collectionSize: collectionSizes.get(index.collectionName) })
            )
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

    /**
     * Calculates all required migrations to sync the arangodb-views with the model
     * @param model
     */
    async getArangoSearchMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        const isSkipVersionCheck =
            this.config.arangoSearchConfiguration &&
            this.config.arangoSearchConfiguration.skipVersionCheckForArangoSearchMigrations;
        if (!isSkipVersionCheck && !(await isArangoSearchSupported(this.versionHelper.getArangoDBVersion()))) {
            return [];
        }
        // the views that match the model
        const requiredViews = getRequiredViewsFromModel(model);
        // the currently existing views
        const views = (await this.db.listViews())
            .map(value => this.db.arangoSearchView(value.name))
            .filter(view =>
                model.rootEntityTypes.some(
                    rootEntityType => view.name === getFlexSearchViewNameForRootEntity(rootEntityType)
                )
            );

        const configuration = this.config.arangoSearchConfiguration;
        const viewsToCreate = await calculateRequiredArangoSearchViewCreateOperations(
            views,
            requiredViews,
            this.db,
            configuration
        );
        const viewsToDrop = calculateRequiredArangoSearchViewDropOperations(views, requiredViews);
        const viewsToUpdate = await calculateRequiredArangoSearchViewUpdateOperations(
            views,
            requiredViews,
            this.db,
            configuration
        );

        return [...viewsToCreate, ...viewsToDrop, ...viewsToUpdate];
    }
}
