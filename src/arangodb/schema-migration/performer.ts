import type { Database } from 'arangojs';
import { CollectionType } from 'arangojs/collections';
import type { ArangoDBConfig } from '../config.js';
import { initDatabase } from '../config.js';
import {
    ERROR_ARANGO_DATA_SOURCE_NOT_FOUND,
    ERROR_ARANGO_DUPLICATE_NAME,
    ERROR_ARANGO_INDEX_NOT_FOUND,
} from '../error-codes.js';
import { configureForBackgroundCreation, isEqualProperties } from './arango-search-helpers.js';
import { type PersistentIndexDefinition } from './index-helpers.js';
import type {
    CreateArangoSearchAnalyzerMigration,
    CreateArangoSearchViewMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    CreateVectorIndexMigration,
    DropIndexMigration,
    DropVectorIndexMigration,
    RecreateArangoSearchViewMigration,
    RecreateVectorIndexMigration,
    SchemaMigration,
    UpdateArangoSearchAnalyzerMigration,
    UpdateArangoSearchViewMigration,
} from './migrations.js';
import { vectorIndexSlotName } from './vector-index/vector-index-helpers.js';

export class MigrationPerformer {
    private readonly db: Database;

    constructor(private readonly config: ArangoDBConfig) {
        this.db = initDatabase(config);
    }

    async performMigration(migration: SchemaMigration) {
        switch (migration.type) {
            case 'createIndex':
                return this.createPersistentIndex(migration);
            case 'dropIndex':
                return this.dropIndex(migration);
            case 'dropVectorIndex':
                return this.dropVectorIndex(migration);
            case 'createVectorIndex':
            case 'recreateVectorIndex':
                return this.createOrRecreateVectorIndex(migration);
            case 'createDocumentCollection':
                return this.createDocumentCollection(migration);
            case 'createEdgeCollection':
                return this.createEdgeCollection(migration);
            case 'createArangoSearchView':
                return this.createArangoSearchView(migration);
            case 'updateArangoSearchView':
                return this.updateArangoSearchView(migration);
            case 'dropArangoSearchView':
                return this.dropArangoSearchView(migration.viewName);
            case 'recreateArangoSearchView':
                return this.recreateArangoSearchView(migration);
            case 'createArangoSearchAnalyzer':
                return this.createArangoSearchAnalyzer(migration);
            case 'updateArangoSearchAnalyzer':
                return this.updateArangoSearchAnalyzer(migration);
            default:
                throw new Error(`Unknown migration type: ${(migration as any).type}`);
        }
    }

    private async createPersistentIndex(migration: CreateIndexMigration) {
        const index = migration.index as PersistentIndexDefinition;
        await this.db.collection(index.collectionName).ensureIndex({
            type: 'persistent',
            fields: index.fields.slice(),
            unique: index.unique,
            sparse: index.sparse,
            inBackground: this.config.createIndicesInBackground,
        });
    }

    private async dropIndex(migration: DropIndexMigration) {
        try {
            await this.db.collection(migration.index.collectionName).dropIndex(migration.index.id!);
        } catch (e: any) {
            // maybe the index has been dropped in the meantime
            if (e.errorNum === ERROR_ARANGO_INDEX_NOT_FOUND) {
                return;
            }
            throw e;
        }
    }

    private async dropVectorIndex(migration: DropVectorIndexMigration) {
        try {
            await this.db.collection(migration.collectionName).dropIndex(migration.index);
        } catch (e: any) {
            if (e.errorNum === ERROR_ARANGO_INDEX_NOT_FOUND) {
                return;
            }
            throw e;
        }
    }

    /**
     * Creates a new vector index (for first-time creation or recreation from an existing one).
     *
     * Both CreateVectorIndexMigration and RecreateVectorIndexMigration are executed identically:
     * 1. Determine the target slot from requiredIndex.slot
     * 2. Call ensureIndex with slot-pinned defaultNProbe (A->1, B->2) to avoid dedup
     * 3. Wait for the new index to become ready
     * 4. If existingIndex is present (recreate): drop the old index
     */
    private async createOrRecreateVectorIndex(
        migration: CreateVectorIndexMigration | RecreateVectorIndexMigration,
    ) {
        const requiredIndex = migration.requiredIndex;
        const slot = requiredIndex.slot ?? 'a';
        const fieldName = requiredIndex.fieldName;
        const indexName = vectorIndexSlotName(fieldName, slot);
        const collectionName = requiredIndex.collectionName;

        // Pin defaultNProbe by slot to prevent ArangoDB's ensureIndex deduplication.
        // ArangoDB considers two indexes identical when all creation parameters match.
        // Since the A/B slot rotation creates a second index with the same field, metric,
        // dimension and nLists, ArangoDB would return the existing index instead of creating
        // a new one. Using slot-distinct defaultNProbe values (A -> 1, B -> 2) ensures the
        // parameter sets always differ, so ensureIndex always creates a fresh index.
        const defaultNProbe = slot === 'a' ? 1 : 2;

        const coll = this.db.collection(collectionName);
        await coll.ensureIndex({
            type: 'vector',
            name: indexName,
            fields: [fieldName],
            sparse: requiredIndex.sparse,
            params: {
                metric: requiredIndex.params.metric,
                dimension: requiredIndex.params.dimension,
                nLists: requiredIndex.params.nLists ?? 1,
                ...(requiredIndex.params.trainingIterations != null
                    ? { trainingIterations: requiredIndex.params.trainingIterations }
                    : {}),
                ...(requiredIndex.params.factory != null
                    ? { factory: requiredIndex.params.factory }
                    : {}),
                defaultNProbe,
            },
            ...(requiredIndex.storedValues && requiredIndex.storedValues.length > 0
                ? { storedValues: requiredIndex.storedValues.map((f) => [f]) }
                : {}),
            inBackground: true,
        } as any);

        // Wait for the new index to become ready (polls trainingState; no-op on pre-3.12.9)
        const timeoutMs = this.config.vectorIndexTrainingTimeoutMs ?? 600_000;
        await this.waitForVectorIndexReady(collectionName, indexName, {
            timeoutMs,
        });

        // If this is a recreation, drop the old index
        if (migration.type === 'recreateVectorIndex') {
            const existingIndex = (migration as RecreateVectorIndexMigration).existingIndex;
            if (existingIndex.id) {
                try {
                    await coll.dropIndex(existingIndex.id);
                } catch (e: any) {
                    // Ignore "index not found" - may have been dropped concurrently
                    if (e.errorNum === ERROR_ARANGO_INDEX_NOT_FOUND) {
                        return;
                    }
                    throw e;
                }
            }
        }
    }

    /**
     * Polls the ArangoDB index API until the vector index reports trainingState "ready".
     *
     * ArangoDB 3.12.9+ reports a `trainingState` field on vector indexes. While the
     * index is still being trained, this field is set to a value other than "ready"
     * (e.g. "training"). We poll at a fixed interval until the index reports "ready"
     * or the timeout is exceeded.
     *
     * If the ArangoDB version does not report trainingState (pre-3.12.9), the method
     * returns immediately - ensureIndex in those versions blocks until training completes.
     */
    async waitForVectorIndexReady(
        collectionName: string,
        indexName: string,
        {
            pollIntervalMs = 500,
            timeoutMs = 600_000,
        }: { pollIntervalMs?: number; timeoutMs?: number } = {},
    ): Promise<void> {
        const startTime = Date.now();

        while (true) {
            const indexes = await this.db.collection(collectionName).indexes();
            const index = indexes.find((i: any) => i.name === indexName) as any;

            if (!index) {
                throw new Error(
                    `Vector index "${indexName}" not found on collection "${collectionName}"`,
                );
            }

            // trainingState is available from ArangoDB 3.12.9+
            // If the field is not present, assume the index is ready (older versions
            // block in ensureIndex until training is complete).
            if (!('trainingState' in index) || index.trainingState === 'ready') {
                return;
            }

            if (Date.now() - startTime > timeoutMs) {
                throw new Error(
                    `Vector index "${indexName}" on collection "${collectionName}" did not become ready within ${timeoutMs}ms (current state: ${index.trainingState})`,
                );
            }

            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }

    private async createDocumentCollection(migration: CreateDocumentCollectionMigration) {
        try {
            await this.db.createCollection(migration.collectionName, {
                ...this.config.createCollectionOptions,
                type: CollectionType.DOCUMENT_COLLECTION,
            });
        } catch (e: any) {
            // maybe the collection has been created in the meantime
            if (e.errorNum === ERROR_ARANGO_DUPLICATE_NAME) {
                const collection = await this.db.collection(migration.collectionName).get();
                if (collection.type === CollectionType.DOCUMENT_COLLECTION) {
                    return;
                }
            }
            throw e;
        }
    }

    private async createEdgeCollection(migration: CreateEdgeCollectionMigration) {
        try {
            await this.db.createCollection(migration.collectionName, {
                ...this.config.createCollectionOptions,
                type: CollectionType.EDGE_COLLECTION,
            });
        } catch (e: any) {
            // maybe the collection has been created in the meantime
            if (e.errorNum === ERROR_ARANGO_DUPLICATE_NAME) {
                const collection = await this.db.collection(migration.collectionName).get();
                if (collection.type === CollectionType.EDGE_COLLECTION) {
                    return;
                }
            }
            throw e;
        }
    }

    private async createArangoSearchView(
        migration: CreateArangoSearchViewMigration | RecreateArangoSearchViewMigration,
        { viewNameOverride }: { viewNameOverride?: string } = {},
    ) {
        try {
            await this.db.createView(
                viewNameOverride ?? migration.viewName,
                configureForBackgroundCreation(migration.properties),
            );
        } catch (e: any) {
            // maybe the collection has been created in the meantime
            if (e.errorNum === ERROR_ARANGO_DUPLICATE_NAME) {
                const existingProperties = await this.db
                    .view(viewNameOverride ?? migration.viewName)
                    .properties();
                // if the properties do not equal, we might need to recreate; rather fail and let someone retry
                if (isEqualProperties(migration.properties, existingProperties)) {
                    return;
                }
            }
            throw e;
        }
    }

    private async updateArangoSearchView(migration: UpdateArangoSearchViewMigration) {
        await this.db
            .view(migration.viewName)
            .replaceProperties(configureForBackgroundCreation(migration.properties));
    }

    private async dropArangoSearchView(viewName: string) {
        try {
            await this.db.view(viewName).drop();
        } catch (e: any) {
            // maybe the view has been dropped in the meantime
            if (e.errorNum === ERROR_ARANGO_DATA_SOURCE_NOT_FOUND) {
                return;
            }
            throw e;
        }
    }

    private async recreateArangoSearchView(migration: RecreateArangoSearchViewMigration) {
        if (this.config.arangoSearchConfiguration?.useRenameStrategyToRecreate) {
            const tempName = 'temp_' + migration.viewName;
            await this.createArangoSearchView(migration, { viewNameOverride: tempName });
            await this.dropArangoSearchView(migration.viewName);
            await this.db.view(tempName).rename(migration.viewName);
        } else {
            await this.dropArangoSearchView(migration.viewName);
            await this.createArangoSearchView(migration);
        }
    }

    private async createArangoSearchAnalyzer(
        migration: CreateArangoSearchAnalyzerMigration | UpdateArangoSearchAnalyzerMigration,
    ) {
        await this.db.createAnalyzer(migration.name, migration.options);
    }

    private async updateArangoSearchAnalyzer(migration: UpdateArangoSearchAnalyzerMigration) {
        try {
            await this.db.analyzer(migration.name).drop(false);
        } catch (e: any) {
            if (e.code === 409) {
                throw new Error(
                    `Failed to drop arangoSearch analyzer because it is still in use. Drop arangoSearch views and run the migration again. ${e.message}`,
                );
            }
            if (e.code !== 404) {
                throw e;
            }
        }

        await this.createArangoSearchAnalyzer(migration);
    }
}
