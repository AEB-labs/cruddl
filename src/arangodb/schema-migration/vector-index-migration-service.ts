import type { Database } from 'arangojs';
import type { Field } from '../../core/model/implementation/field.js';
import type { Model } from '../../core/model/implementation/model.js';
import type { RootEntityType } from '../../core/model/implementation/root-entity-type.js';
import { getCollectionNameForRootEntity } from '../arango-basics.js';
import type { ArangoDBConfig } from '../config.js';
import {
    getRequiredIndicesFromModel,
    mapMetricForArango,
    vectorIndexMatchesByField,
    type VectorIndexDefinition,
} from './index-helpers.js';
import {
    CreateVectorIndexMigration,
    DropIndexMigration,
    RecreateVectorIndexMigration,
} from './migrations.js';
import {
    planVectorIndexMigrationsForField,
    resolveRequiredVectorIndex,
} from './vector-index-migration-planner.js';

/**
 * Orchestrates vector index migration planning with database access.
 *
 * The pure planning logic lives in {@link planVectorIndexMigrationsForField}; this
 * service adds the DB-access layer (fetching indices, counting documents, converting
 * raw ArangoDB objects) so callers don't have to duplicate that wiring.
 */
export class VectorIndexMigrationService {
    constructor(
        private readonly db: Database,
        private readonly config: ArangoDBConfig,
    ) {}

    // -----------------------------------------------------------------------
    // Model-level: plan all vector index migrations
    // -----------------------------------------------------------------------

    /**
     * Plans all vector index migrations for the given model.
     *
     * Covers per-field create / recreate / stuck-slot cleanup **and** drops for fields
     * that have been removed from the model entirely.
     */
    async getVectorIndexMigrations(
        model: Model,
    ): Promise<
        ReadonlyArray<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropIndexMigration
        >
    > {
        // Fetch all existing indices across all collections (parallel).
        const existingIndicesPromises = model.rootEntityTypes.map((rootEntityType) =>
            this.getExistingVectorIndices(rootEntityType),
        );
        const existingIndices = (await Promise.all(existingIndicesPromises)).flat();

        const requiredIndices = getRequiredIndicesFromModel(model).filter(
            (i): i is VectorIndexDefinition => i.type === 'vector',
        );

        // Collect document counts (sparse-aware) for every collection that has a required
        // vector index.
        const collectionSizes = new Map<string, number>();
        for (const index of requiredIndices) {
            if (!collectionSizes.has(index.collectionName)) {
                try {
                    const count = await collectVectorDocumentCount(
                        this.db,
                        index.collectionName,
                        index,
                    );
                    collectionSizes.set(index.collectionName, count);
                } catch {
                    // collection may not exist yet — treat as 0
                }
            }
        }

        const migrations: Array<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropIndexMigration
        > = [];

        // Per-field migration planning: stuck-slot cleanup + create/recreate.
        const stuckDroppedIndices = new Set<VectorIndexDefinition>();

        for (const required of requiredIndices) {
            const docCount = collectionSizes.get(required.collectionName) ?? 0;
            const { resolvedRequired, nListsPinned } = resolveRequiredVectorIndex(
                required,
                docCount,
            );

            const existingForField = existingIndices.filter((ex) =>
                vectorIndexMatchesByField(ex, required),
            );

            const fieldMigrations = await planVectorIndexMigrationsForField({
                existingForField,
                requiredIndex: resolvedRequired,
                documentCount: docCount,
                nListsPinned,
                nListsRebuildThreshold: this.config.vectorIndexNListsRebuildThreshold,
                stuckSlotWaitMs: this.config.vectorIndexStuckSlotWaitMs,
                refreshIndicesForStuckCheck: () =>
                    this.fetchVectorIndicesForField(required.rootEntity, required.fields[0]),
            });

            for (const m of fieldMigrations) {
                migrations.push(m);
                if (m instanceof DropIndexMigration) {
                    stuckDroppedIndices.add(m.index as VectorIndexDefinition);
                }
            }
        }

        // Drop existing vector indexes that are no longer required by the model.
        for (const existing of existingIndices) {
            if (stuckDroppedIndices.has(existing)) {
                continue;
            }
            const stillRequired = requiredIndices.some((req) =>
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

    // -----------------------------------------------------------------------
    // Field-level: plan migrations for a single field (used by recreateVectorIndex)
    // -----------------------------------------------------------------------

    /**
     * Plans migrations for a single vector index field.
     *
     * @param field         The model field with a vector index.
     * @param options.forceRecreate When true, emit a {@link RecreateVectorIndexMigration} even if the
     *                      existing index already matches the required parameters. This uses the
     *                      regular A/B slot rotation for zero-downtime rebuilds.
     */
    async planMigrationsForField(
        field: Field,
        options?: { forceRecreate?: boolean },
    ): Promise<
        ReadonlyArray<
            CreateVectorIndexMigration | RecreateVectorIndexMigration | DropIndexMigration
        >
    > {
        const vectorIndex = field.vectorIndex;
        if (!vectorIndex) {
            throw new Error(
                `Field "${field.declaringType.name}.${field.name}" has no vector index`,
            );
        }

        const rootEntityType = field.declaringType;
        if (!rootEntityType.isRootEntityType) {
            throw new Error(
                `Field "${field.declaringType.name}.${field.name}" is not on a root entity type`,
            );
        }

        const collectionName = getCollectionNameForRootEntity(rootEntityType);

        // Build the required index definition from the model field.
        const requiredRaw: VectorIndexDefinition = {
            type: 'vector',
            rootEntity: rootEntityType,
            collectionName,
            fields: [field.name] as [string],
            sparse: vectorIndex.sparse,
            params: {
                metric: mapMetricForArango(vectorIndex.metric),
                dimension: vectorIndex.dimension || 1,
                nLists: vectorIndex.nLists,
                trainingIterations: vectorIndex.trainingIterations,
                factory: vectorIndex.factory,
            },
            storedValues: vectorIndex.storedValues,
        };

        const documentCount = await collectVectorDocumentCount(
            this.db,
            collectionName,
            requiredRaw,
        );

        if (documentCount === 0) {
            throw new Error(
                `Collection "${collectionName}" has no documents — vector index cannot be trained on empty data`,
            );
        }

        const { resolvedRequired, nListsPinned } = resolveRequiredVectorIndex(
            requiredRaw,
            documentCount,
        );

        const existingForField = await this.fetchVectorIndicesForField(rootEntityType, field.name);

        return planVectorIndexMigrationsForField({
            existingForField,
            requiredIndex: resolvedRequired,
            documentCount,
            nListsPinned,
            stuckSlotWaitMs: this.config.vectorIndexStuckSlotWaitMs,
            refreshIndicesForStuckCheck: () =>
                this.fetchVectorIndicesForField(rootEntityType, field.name),
            forceRecreate: options?.forceRecreate,
        });
    }

    // -----------------------------------------------------------------------
    // DB-access helpers
    // -----------------------------------------------------------------------

    /**
     * Fetches all existing index definitions (persistent + vector) for a root entity's
     * collection.
     */
    private async getExistingVectorIndices(
        rootEntityType: RootEntityType,
    ): Promise<ReadonlyArray<VectorIndexDefinition>> {
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const coll = this.db.collection(collectionName);
        if (!(await coll.exists())) {
            return [];
        }

        const result = await this.db.collection(collectionName).indexes();
        return result.flatMap((index) =>
            index.type === 'vector'
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
     * Fetches vector index definitions for a specific field from the database.
     */
    private async fetchVectorIndicesForField(
        rootEntityType: RootEntityType,
        fieldName: string,
    ): Promise<VectorIndexDefinition[]> {
        const collectionName = getCollectionNameForRootEntity(rootEntityType);
        const coll = this.db.collection(collectionName);
        if (!(await coll.exists())) {
            return [];
        }

        const all = await coll.indexes();
        return (all as ReadonlyArray<any>)
            .filter(
                (idx: any) =>
                    idx.type === 'vector' &&
                    idx.fields?.length === 1 &&
                    idx.fields[0] === fieldName,
            )
            .map((idx: any) => toVectorIndexDefinition(idx, rootEntityType, collectionName));
    }
}

/**
 * Converts a raw ArangoDB index object into a typed {@link VectorIndexDefinition}.
 *
 * Both the analyzer and the adapter need this conversion; centralising it here avoids
 * duplicating field-mapping logic in multiple call-sites.
 */
function toVectorIndexDefinition(
    rawIndex: any,
    rootEntity: RootEntityType,
    collectionName: string,
): VectorIndexDefinition {
    return {
        type: 'vector',
        id: rawIndex.id,
        name: rawIndex.name,
        rootEntity,
        collectionName,
        fields: [rawIndex.fields[0] as string] as [string],
        sparse: rawIndex.sparse ?? false,
        params: {
            metric: rawIndex.params?.metric ?? 'cosine',
            dimension: rawIndex.params?.dimension ?? 1,
            nLists: rawIndex.params?.nLists,
            trainingIterations: rawIndex.params?.trainingIterations,
            factory: rawIndex.params?.factory,
        },
        storedValues: rawIndex.storedValues,
        trainingState: rawIndex.trainingState,
    };
}

/**
 * Returns the effective document count for a vector index on a collection.
 *
 * For a **non-sparse** index every document contributes a vector, so the full collection
 * count is returned. For a **sparse** index only documents where the vector field is not
 * null are indexed — an AQL count query is used for those.
 */
export async function collectVectorDocumentCount(
    db: Database,
    collectionName: string,
    index: { sparse: boolean; fields: readonly string[] },
): Promise<number> {
    if (!index.sparse) {
        const result = await db.collection(collectionName).count();
        return result.count;
    }

    const fieldName = index.fields[0];
    const cursor = await db.query(
        `FOR doc IN @@col FILTER doc[@field] != null COLLECT WITH COUNT INTO c RETURN c`,
        { '@col': collectionName, field: fieldName },
    );
    const rows = await cursor.all();
    return (rows[0] as number) ?? 0;
}
