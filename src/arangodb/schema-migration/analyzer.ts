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
import type { IndexDefinition, VectorIndexDefinition } from './index-helpers.js';
import {
    calculateRequiredIndexOperations,
    computeAutoNLists,
    getRequiredIndicesFromModel,
    getVectorIndexSlot,
    nListsDriftExceedsThreshold,
    vectorIndexMatchesByField,
} from './index-helpers.js';
import type { CreateArangoSearchAnalyzerMigrationConfig, SchemaMigration } from './migrations.js';
import {
    CreateArangoSearchAnalyzerMigration,
    CreateDocumentCollectionMigration,
    CreateEdgeCollectionMigration,
    CreateIndexMigration,
    CreateVectorIndexMigration,
    DropIndexMigration,
    RecreateVectorIndexMigration,
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
            this.getCollectionIndices(rootEntityType),
        );
        const existingIndices: IndexDefinition[] = (
            await Promise.all(existingIndicesPromises)
        ).flat();
        const existingPersistentIndices = existingIndices.filter((i) => i.type === 'persistent');

        const requiredPersistentIndices = getRequiredIndicesFromModel(model).filter(
            (i) => i.type === 'persistent',
        );

        const { persistentIndicesToDelete, persistentIndicesToCreate } =
            calculateRequiredIndexOperations(
                existingPersistentIndices,
                requiredPersistentIndices,
                this.config,
            );

        // Fetch collection document counts for the affected collections
        const collectionSizes = new Map<string, number>();
        for (const index of [...persistentIndicesToCreate, ...persistentIndicesToDelete]) {
            if (!collectionSizes.has(index.collectionName)) {
                try {
                    const countResult = await this.db.collection(index.collectionName).count();
                    collectionSizes.set(index.collectionName, countResult.count);
                } catch (e) {
                    // ignore — collection may not exist yet
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
     * Vector indexes differ from persistent indexes in several important ways:
     *
     * 1. **Deferred creation**: ArangoDB trains IVF clusters during index creation. An empty
     *    collection has nothing to train on, so we skip the create migration until documents exist.
     *
     * 2. **nLists auto-computation**: When the model does not pin an explicit `nLists` value, we
     *    compute one as `max(1, min(N, round(15 × sqrt(N))))` from the current document count N.
     *    This formula balances recall quality against memory and I/O cost.
     *
     * 3. **nLists drift detection**: As data volume grows, the auto-computed nLists value may
     *    diverge from the value used when the index was originally built. If
     *    `vectorIndexNListsRebuildThreshold` is configured, a recreate migration is generated when
     *    the drift exceeds the threshold. Without the threshold, no automatic rebuild is triggered
     *    for nLists drift alone.
     *
     * 4. **A/B slot naming**: To avoid downtime during recreation, new indexes are built in an
     *    alternating slot ('a' or 'b'). The old index is dropped only after the new one is ready.
     */
    async getVectorIndexMigrations(
        model: Model,
    ): Promise<
        ReadonlyArray<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropIndexMigration
        >
    > {
        // Fetch all existing indices and separate out vector ones
        const existingIndicesPromises = model.rootEntityTypes.map((rootEntityType) =>
            this.getCollectionIndices(rootEntityType),
        );
        const existingIndices: IndexDefinition[] = (
            await Promise.all(existingIndicesPromises)
        ).flat();
        const existingVectorIndices = existingIndices.filter(
            (i): i is VectorIndexDefinition => i.type === 'vector',
        );

        const requiredVectorIndices = getRequiredIndicesFromModel(model).filter(
            (i): i is VectorIndexDefinition => i.type === 'vector',
        );

        // Fetch document counts for all collections that have vector indexes.
        // For sparse indexes the count should ideally reflect only documents where the field
        // is not null, but we use the total collection count here as an approximation.
        // See collectDocumentCount() for the sparse-aware variant.
        const collectionSizes = new Map<string, number>();
        for (const index of requiredVectorIndices) {
            if (!collectionSizes.has(index.collectionName)) {
                try {
                    const count = await this.collectDocumentCount(index.collectionName, index);
                    collectionSizes.set(index.collectionName, count);
                } catch (e) {
                    // collection may not exist yet — treat as 0
                }
            }
        }

        const migrations: Array<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropIndexMigration
        > = [];

        // Detect "stuck" A/B state: both slot-A and slot-B of the same vector index exist,
        // meaning a previous recreation was interrupted after the new index was built but before
        // the old one was dropped.  We clean up by dropping the B-slot copy so the next run
        // starts from a clean single-slot state.
        const vectorIndexesByField = new Map<string, VectorIndexDefinition[]>();
        for (const idx of existingVectorIndices) {
            const key = `${idx.collectionName}/${idx.fields[0]}`;
            const list = vectorIndexesByField.get(key);
            if (list) {
                list.push(idx);
            } else {
                vectorIndexesByField.set(key, [idx]);
            }
        }
        const stuckBSlotIndices = new Set<VectorIndexDefinition>();
        for (const [, group] of vectorIndexesByField) {
            if (group.length >= 2) {
                const bIndex = group.find(
                    (idx) => idx.name != null && getVectorIndexSlot(idx.name) === 'b',
                );
                if (bIndex) {
                    stuckBSlotIndices.add(bIndex);
                    migrations.push(
                        new DropIndexMigration({
                            index: bIndex,
                            collectionSize: collectionSizes.get(bIndex.collectionName),
                        }),
                    );
                }
            }
        }

        // From here on, exclude stuck B-slot indexes from further analysis so we don't
        // generate spurious "create" or "recreate" migrations alongside the cleanup drops.
        const activeExistingVectorIndices = existingVectorIndices.filter(
            (idx) => !stuckBSlotIndices.has(idx),
        );

        for (const required of requiredVectorIndices) {
            const docCount = collectionSizes.get(required.collectionName) ?? 0;
            const existing = activeExistingVectorIndices.find((ex) =>
                vectorIndexMatchesByField(ex, required),
            );

            // Resolve nLists: use the explicit pinned value from the model, or auto-compute from
            // the current document count. The auto-computed value is max(1, min(N, 15×√N)).
            const resolvedNLists = required.params.nLists ?? computeAutoNLists(docCount);
            const nListsPinned = required.params.nLists != null;

            const resolvedRequired: VectorIndexDefinition = {
                ...required,
                params: { ...required.params, nLists: resolvedNLists },
            };

            if (!existing) {
                if (docCount === 0) {
                    // The collection is empty — skip for now. ArangoDB cannot train IVF clusters
                    // on an empty collection. The migration will be generated once documents exist
                    // (on the next analysis run or after a manual "refresh migrations" in the UI).
                    continue;
                }
                migrations.push(
                    new CreateVectorIndexMigration({
                        requiredIndex: resolvedRequired,
                        collectionSize: docCount,
                    }),
                );
            } else {
                const needsRecreate = this.vectorIndexNeedsRecreation(
                    existing,
                    resolvedRequired,
                    nListsPinned,
                );
                if (needsRecreate) {
                    migrations.push(
                        new RecreateVectorIndexMigration({
                            existingIndex: existing,
                            requiredIndex: resolvedRequired,
                            collectionSize: docCount,
                        }),
                    );
                }
            }
        }

        // Drop existing vector indexes that are no longer required by the model.
        // Note: stuck B-slot indexes are already handled above; only active ones are checked here.
        for (const existing of activeExistingVectorIndices) {
            const stillRequired = requiredVectorIndices.some((req) =>
                vectorIndexMatchesByField(existing, req),
            );
            if (!stillRequired) {
                migrations.push(
                    new DropIndexMigration({
                        index: existing,
                        collectionSize: collectionSizes.get(existing.collectionName),
                    }),
                );
            }
        }

        return migrations;
    }

    /**
     * Returns the effective document count for a vector index on a collection.
     *
     * For a **non-sparse** index, every document contributes a vector embedding, so the full
     * collection count is returned. For a **sparse** index, only documents where the vector field
     * is not null are indexed, so an AQL query is used to count those documents. This distinction
     * matters for nLists auto-computation: using the full count for a sparse index would
     * over-estimate the data volume and produce a larger-than-necessary nLists value.
     */
    private async collectDocumentCount(
        collectionName: string,
        index: VectorIndexDefinition,
    ): Promise<number> {
        if (!index.sparse) {
            const result = await this.db.collection(collectionName).count();
            return result.count;
        }
        // Sparse index: count only documents where the indexed field is not null
        const fieldName = index.fields[0];
        const cursor = await this.db.query(
            `FOR doc IN @@col FILTER doc[@field] != null COLLECT WITH COUNT INTO c RETURN c`,
            { '@col': collectionName, field: fieldName },
        );
        const rows = await cursor.all();
        return (rows[0] as number) ?? 0;
    }

    /**
     * Determines whether an existing vector index must be recreated because its configuration has
     * diverged from what the model requires.
     *
     * ### What triggers recreation
     * - **Metric change**: switching between COSINE, L2, and INNER_PRODUCT changes the distance
     *   function and invalidates the trained clusters — a rebuild is mandatory.
     * - **Dimension change**: the embedding dimensionality affects the cluster centroids — a
     *   rebuild is mandatory.
     * - **Sparseness change**: controls whether null-embedding documents are indexed.
     * - **storedValues change**: changes which extra fields are co-located with the index for
     *   efficient pre-filtering.
     * - **nLists changes (pinned)**: when an explicit `nLists` is set in the model and it differs
     *   from the current index, the index is rebuilt to match.
     * - **nLists drift (auto-computed)**: when `nLists` is not pinned, the value is re-computed
     *   from the current document count. If the computed value differs from the existing index by
     *   more than `vectorIndexNListsRebuildThreshold` (e.g. 0.25 = 25 %), a rebuild is scheduled.
     *   Without a configured threshold, nLists drift alone never triggers a rebuild.
     */
    private vectorIndexNeedsRecreation(
        existing: VectorIndexDefinition,
        required: VectorIndexDefinition,
        nListsPinned: boolean,
    ): boolean {
        // Core parameter changes always require a full rebuild
        if (
            existing.params.metric !== required.params.metric ||
            existing.params.dimension !== required.params.dimension ||
            existing.sparse !== required.sparse
        ) {
            return true;
        }

        // storedValues changes require a rebuild
        if ((existing.storedValues ?? []).join('|') !== (required.storedValues ?? []).join('|')) {
            return true;
        }

        // nLists checks — only relevant when both existing and resolved nLists are known
        if (existing.params.nLists != null && required.params.nLists != null) {
            if (nListsPinned) {
                // Explicit nLists in the model: rebuild whenever the value differs
                return existing.params.nLists !== required.params.nLists;
            } else {
                // Auto-computed nLists: rebuild only when drift exceeds the configured threshold.
                // If no threshold is configured, nLists drift never triggers an automatic rebuild —
                // operators can trigger a manual rebuild via recreateVectorIndex().
                const threshold = this.config.vectorIndexNListsRebuildThreshold;
                if (threshold == null) {
                    return false;
                }
                return nListsDriftExceedsThreshold(
                    existing.params.nLists,
                    required.params.nLists,
                    threshold,
                );
            }
        }

        return false;
    }

    async getCollectionIndices(
        rootEntityType: RootEntityType,
    ): Promise<ReadonlyArray<IndexDefinition>> {
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const coll = this.db.collection(collectionName);
        if (!(await coll.exists())) {
            return [];
        }

        const result = await this.db.collection(collectionName).indexes();
        return result.flatMap((index) =>
            index.type === 'persistent' || index.type === 'vector'
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
