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
import type { PersistentIndexDefinition } from './index-helpers.js';
import { calculateRequiredIndexOperations, getRequiredIndicesFromModel } from './index-helpers.js';
import type { CreateArangoSearchAnalyzerMigrationConfig, SchemaMigration } from './migrations.js';
import {
    CreateArangoSearchAnalyzerMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    CreateVectorIndexMigration,
    DropIndexMigration,
    DropVectorIndexMigration,
    RecreateVectorIndexMigration,
    UpdateArangoSearchAnalyzerMigration,
} from './migrations.js';
import { VectorIndexAnalyzer } from './vector-index/vector-index-analyzer.js';

export class SchemaAnalyzer {
    private readonly db: Database;
    private readonly logger: Logger;
    private readonly vectorIndexAnalyzer: VectorIndexAnalyzer;

    constructor(
        readonly config: ArangoDBConfig,
        schemaContext?: ProjectOptions,
    ) {
        this.db = initDatabase(config);
        this.logger = getArangoDBLogger(schemaContext);
        this.vectorIndexAnalyzer = new VectorIndexAnalyzer(this.db, config);
    }

    async getOutstandingMigrations(model: Model): Promise<ReadonlyArray<SchemaMigration>> {
        return [
            ...(await this.getDocumentCollectionMigrations(model)),
            ...(await this.getEdgeCollectionMigrations(model)),
            ...(await this.getPersistentIndexMigrations(model)),
            ...(await this.getVectorIndexMigrations(model)),
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

    /**
     * Returns migrations needed to bring persistent (non-vector) indexes in sync with the model.
     */
    async getPersistentIndexMigrations(
        model: Model,
    ): Promise<ReadonlyArray<CreateIndexMigration | DropIndexMigration>> {
        // Fetch all existing indices and separate out persistent ones
        const existingIndicesPromises = model.rootEntityTypes.map((rootEntityType) =>
            this.getPersistentIndices(rootEntityType),
        );
        const existingIndices = (await Promise.all(existingIndicesPromises)).flat();

        const requiredIndices = getRequiredIndicesFromModel(model).filter(
            (i) => i.type === 'persistent',
        );

        const { persistentIndicesToDelete, persistentIndicesToCreate } =
            calculateRequiredIndexOperations(existingIndices, requiredIndices, this.config);

        // Fetch collection document counts for the affected collections
        const collectionSizes = new Map<string, number>();
        for (const index of [...persistentIndicesToCreate, ...persistentIndicesToDelete]) {
            if (!collectionSizes.has(index.collectionName)) {
                try {
                    const countResult = await this.db.collection(index.collectionName).count();
                    collectionSizes.set(index.collectionName, countResult.count);
                } catch (e) {
                    // ignore - collection may not exist yet
                }
            }
        }

        const migrations: Array<CreateIndexMigration | DropIndexMigration> = [];
        for (const index of persistentIndicesToCreate) {
            migrations.push(
                new CreateIndexMigration({
                    index,
                    collectionSize: collectionSizes.get(index.collectionName),
                }),
            );
        }
        for (const index of persistentIndicesToDelete) {
            migrations.push(
                new DropIndexMigration({
                    index,
                    collectionSize: collectionSizes.get(index.collectionName),
                }),
            );
        }
        return migrations;
    }

    /**
     * Returns migrations needed to bring vector indexes in sync with the model.
     *
     * Phase 1: For each vector-indexed field, call analyzeField() and collect migrations.
     * Phase 2: Drop orphaned vector indexes whose field is no longer in the model.
     */
    async getVectorIndexMigrations(
        model: Model,
    ): Promise<
        ReadonlyArray<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropVectorIndexMigration
        >
    > {
        const migrations: Array<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropVectorIndexMigration
        > = [];

        // Phase 1 - Per-field analysis
        for (const rootEntityType of model.rootEntityTypes) {
            for (const vectorIndex of rootEntityType.vectorIndices) {
                const status = await this.vectorIndexAnalyzer.analyzeField(
                    vectorIndex.field,
                    false,
                );
                for (const migration of status.migrations) {
                    migrations.push(
                        migration as
                            | CreateVectorIndexMigration
                            | RecreateVectorIndexMigration
                            | DropVectorIndexMigration,
                    );
                }
            }
        }

        // Phase 2 - Orphaned index cleanup
        for (const rootEntityType of model.rootEntityTypes) {
            const collectionName = getCollectionNameForRootEntity(rootEntityType);
            const coll = this.db.collection(collectionName);
            if (!(await coll.exists())) {
                continue;
            }

            const allIndexes = await coll.indexes();
            const vectorIndexedFieldNames = new Set(
                rootEntityType.vectorIndices.map((vi) => vi.field.name),
            );

            for (const index of allIndexes) {
                if (index.type !== 'vector') {
                    continue;
                }
                const indexName: string = index.name ?? '';
                if (!indexName.startsWith('vector_')) {
                    continue;
                }
                // Extract field name from the index fields array (should be a single element)
                const indexFields: string[] = index.fields ?? [];
                if (indexFields.length !== 1) {
                    continue;
                }
                const indexFieldName = indexFields[0];
                if (!vectorIndexedFieldNames.has(indexFieldName)) {
                    migrations.push(
                        new DropVectorIndexMigration({
                            index,
                            collectionName,
                        }),
                    );
                }
            }
        }

        return migrations;
    }

    private async getPersistentIndices(
        rootEntityType: RootEntityType,
    ): Promise<ReadonlyArray<PersistentIndexDefinition>> {
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const coll = this.db.collection(collectionName);
        if (!(await coll.exists())) {
            return [];
        }

        const result = await this.db.collection(collectionName).indexes();
        return result
            .filter((index) => index.type === 'persistent')
            .map(
                (index): PersistentIndexDefinition => ({
                    ...index,
                    rootEntity: rootEntityType,
                    collectionName,
                }),
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
