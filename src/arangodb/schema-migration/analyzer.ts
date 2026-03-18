import type { Database } from 'arangojs';
import { CollectionType } from 'arangojs/collections';
import type { ProjectOptions } from '../../core/config/interfaces.js';
import type { Logger } from '../../core/config/logging.js';
import { NORM_CI_ANALYZER } from '../../core/model/implementation/flex-search.js';
import type { Model } from '../../core/model/implementation/model.js';
import type { RootEntityType } from '../../core/model/implementation/root-entity-type.js';
import {
    billingCollectionName,
    getCollectionNameForRelation,
    getCollectionNameForRootEntity,
} from '../arango-basics.js';
import type { ArangoDBConfig } from '../config.js';
import { getArangoDBLogger, initDatabase } from '../config.js';
import {
    areAnalyzersEqual,
    calculateRequiredArangoSearchViewCreateOperations,
    calculateRequiredArangoSearchViewDropOperations,
    calculateRequiredArangoSearchViewUpdateOperations,
    getFlexSearchViewNameForRootEntity,
    getRequiredViewsFromModel,
} from './arango-search-helpers.js';
import type { IndexDefinition } from './index-helpers.js';
import { calculateRequiredIndexOperations, getRequiredIndicesFromModel } from './index-helpers.js';
import type { CreateArangoSearchAnalyzerMigrationConfig, SchemaMigration } from './migrations.js';
import {
    CreateArangoSearchAnalyzerMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    DropIndexMigration,
    UpdateArangoSearchAnalyzerMigration,
} from './migrations.js';

export class SchemaAnalyzer {
    private readonly db: Database;
    private readonly logger: Logger;

    constructor(
        readonly config: ArangoDBConfig,
        schemaContext?: ProjectOptions,
    ) {
        this.db = initDatabase(config);
        this.logger = getArangoDBLogger(schemaContext);
    }

    async getOutstandingMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        return [
            ...(await this.getDocumentCollectionMigrations(model)),
            ...(await this.getEdgeCollectionMigrations(model)),
            ...(await this.getIndexMigrations(model)),
            ...(await this.getArangoSearchMigrations(model)),
        ];
    }

    async getDocumentCollectionMigrations(
        model: Model,
    ): Promise<ReadonlyArray<CreateDocumentCollectionMigration>> {
        // Get existing collections in ArangoDB
        const existingCollections = (await this.db.listCollections()).filter(
            (coll) => coll.type === CollectionType.DOCUMENT_COLLECTION,
        );
        const existingCollectionNames = new Set(existingCollections.map((coll) => coll.name));

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
            !migrations.some((value) => value.collectionName === billingCollectionName)
        ) {
            migrations.push(new CreateDocumentCollectionMigration(billingCollectionName));
        }

        return migrations;
    }

    async getEdgeCollectionMigrations(
        model: Model,
    ): Promise<ReadonlyArray<CreateEdgeCollectionMigration>> {
        // Get existing collections in ArangoDB
        const existingCollections = (await this.db.listCollections()).filter(
            (coll) => coll.type === CollectionType.EDGE_COLLECTION,
        );
        const existingCollectionNames = new Set(existingCollections.map((coll) => coll.name));

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

    async getIndexMigrations(
        model: Model,
    ): Promise<ReadonlyArray<CreateIndexMigration | DropIndexMigration>> {
        // update indices
        const requiredIndices = getRequiredIndicesFromModel(model);
        const existingIndicesPromises = model.rootEntityTypes.map((rootEntityType) =>
            this.getPersistentCollectionIndices(rootEntityType),
        );
        const existingIndices: IndexDefinition[] = [];
        await Promise.all(existingIndicesPromises).then((promiseResults) =>
            promiseResults.forEach((indices) =>
                indices.forEach((index) => existingIndices.push(index)),
            ),
        );
        const { indicesToDelete, indicesToCreate } = calculateRequiredIndexOperations(
            existingIndices,
            requiredIndices,
            this.config,
        );

        // this is useful to show a warning on large collections which would take a while to create an index
        // (or even automatically defer large indices)
        const collectionSizes = new Map<string, number>();
        for (const index of [...indicesToCreate, ...indicesToDelete]) {
            if (!collectionSizes.has(index.collectionName)) {
                let collectionSize;
                try {
                    const countResult = await this.db.collection(index.collectionName).count();
                    collectionSize = countResult.count;
                    collectionSizes.set(index.collectionName, collectionSize);
                } catch {
                    // ignore
                }
            }
        }

        return [
            ...indicesToCreate.map(
                (index) =>
                    new CreateIndexMigration({
                        index,
                        collectionSize: collectionSizes.get(index.collectionName),
                    }),
            ),
            ...indicesToDelete.map(
                (index) =>
                    new DropIndexMigration({
                        index,
                        collectionSize: collectionSizes.get(index.collectionName),
                    }),
            ),
        ];
    }

    async getPersistentCollectionIndices(
        rootEntityType: RootEntityType,
    ): Promise<ReadonlyArray<IndexDefinition>> {
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const coll = this.db.collection(collectionName);
        if (!(await coll.exists())) {
            return [];
        }

        const result = await this.db.collection(collectionName).indexes();
        return result.flatMap((index) =>
            index.type === 'persistent'
                ? [
                      {
                          ...index,
                          rootEntity: rootEntityType,
                          collectionName,
                      },
                  ]
                : [],
        );
    }

    /**
     * Calculates all required migrations to sync the arangodb-views with the model
     * @param model
     */
    async getArangoSearchMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        const requiredAnalyzers = this.getRequiredAnalyzers();
        const analyzerUpdates: SchemaMigration[] = [];
        for (const requiredAnalyzer of requiredAnalyzers) {
            const analyzer = this.db.analyzer(requiredAnalyzer.name);
            if (await analyzer.exists()) {
                const existingAnalyzer = await analyzer.get();
                if (
                    existingAnalyzer.type !== requiredAnalyzer.options.type ||
                    !areAnalyzersEqual(existingAnalyzer, requiredAnalyzer.options)
                ) {
                    analyzerUpdates.push(new UpdateArangoSearchAnalyzerMigration(requiredAnalyzer));
                }
            } else {
                analyzerUpdates.push(new CreateArangoSearchAnalyzerMigration(requiredAnalyzer));
            }
        }

        // the views that match the model
        const requiredViews = getRequiredViewsFromModel(model);
        // the currently existing views
        const views = (await this.db.listViews())
            .map((value) => this.db.view(value.name))
            .filter((view) =>
                model.rootEntityTypes.some(
                    (rootEntityType) =>
                        view.name === getFlexSearchViewNameForRootEntity(rootEntityType),
                ),
            );

        const configuration = this.config.arangoSearchConfiguration;
        const viewsToCreate = await calculateRequiredArangoSearchViewCreateOperations(
            views,
            requiredViews,
            this.db,
            configuration,
        );
        const viewsToDrop = calculateRequiredArangoSearchViewDropOperations(views, requiredViews);
        const viewsToUpdate = await calculateRequiredArangoSearchViewUpdateOperations(
            views,
            requiredViews,
            this.db,
            configuration,
        );

        return [...analyzerUpdates, ...viewsToCreate, ...viewsToDrop, ...viewsToUpdate];
    }

    private getRequiredAnalyzers(): ReadonlyArray<CreateArangoSearchAnalyzerMigrationConfig> {
        return [
            {
                name: NORM_CI_ANALYZER,
                options: {
                    type: 'norm',
                    properties: {
                        locale: 'en.utf-8',
                        case: 'lower',
                        accent: false,
                    },
                },
            },
        ];
    }
}
