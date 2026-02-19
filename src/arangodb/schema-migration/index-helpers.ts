import type { IndexField } from '../../core/model/implementation/indices.js';
import type { Model } from '../../core/model/implementation/model.js';
import type { RootEntityType } from '../../core/model/implementation/root-entity-type.js';
import { ID_FIELD } from '../../core/schema/constants.js';
import {
    GraphQLOffsetDateTime,
    TIMESTAMP_PROPERTY,
} from '../../core/schema/scalars/offset-date-time.js';
import { isDefined } from '../../core/utils/utils.js';
import { getCollectionNameForRootEntity } from '../arango-basics.js';
import type { ArangoDBConfig } from '../config.js';

const DEFAULT_INDEX_TYPE = 'persistent';

export type ArangoVectorSimilarityMetric = 'cosine' | 'l2' | 'innerProduct';

export interface PersistentIndexDefinition {
    readonly id?: string;
    readonly name?: string;
    readonly rootEntity: RootEntityType;
    readonly fields: ReadonlyArray<string>;
    readonly collectionName: string;
    readonly unique: boolean;
    readonly sparse: boolean;
    readonly type: 'persistent';
}

export interface VectorIndexDefinition {
    /**
     * Present when this definition was fetched from the database (existing index).
     * Never set for model-derived required-index definitions — the index name is assigned
     * at migration time via the A/B slot scheme (see vectorIndexSlotName).
     */
    readonly id?: string;
    /**
     * Present when this definition was fetched from the database (existing index).
     * Never set for model-derived required-index definitions — the index name is assigned
     * at migration time via the A/B slot scheme (see vectorIndexSlotName).
     */
    readonly name?: string;
    readonly rootEntity: RootEntityType;
    readonly fields: [string];
    readonly collectionName: string;
    readonly sparse: boolean;
    readonly type: 'vector';
    readonly params: {
        readonly metric: ArangoVectorSimilarityMetric;
        readonly dimension: number;
        readonly nLists?: number;
        readonly trainingIterations?: number;
        readonly factory?: string;
    };
    readonly storedValues?: ReadonlyArray<string>;
    /**
     * Training state reported by ArangoDB 3.12.9+ for vector indexes.
     * "ready" indicates the index has been fully trained and is usable.
     * Only present when fetched from the database.
     */
    readonly trainingState?: string;
}

export type IndexDefinition = PersistentIndexDefinition | VectorIndexDefinition;

export function describeIndex(index: IndexDefinition) {
    const indexTypePrefix = index.type === 'persistent' && index.unique ? 'unique ' : '';
    const sparsePrefix = index.sparse ? 'sparse ' : '';
    const vectorSuffix =
        index.type === 'vector'
            ? ` (metric: ${index.params.metric}, dimension: ${index.params.dimension})`
            : '';
    return `${indexTypePrefix}${sparsePrefix}${index.type} index${
        index.name ? ` "${index.name}"` : index.id ? ' ' + index.id : ''
    } on collection ${index.collectionName} on ${
        index.fields.length > 1 ? 'fields' : 'field'
    } '${index.fields.join(',')}'${vectorSuffix}`;
}

export function getIndexDescriptor(index: IndexDefinition) {
    return [
        index.id, // contains collection and id separated by slash (missing for indices to be created)
        index.name, // name as specified by user
        `type:${index.type}`,
        index.type === 'persistent' && index.unique ? 'unique' : undefined,
        index.sparse ? 'sparse' : undefined,
        `collection:${index.collectionName}`,
        `fields:${index.fields.join(',')}`,
        ...(index.type === 'vector' ? getVectorIndexDescriptorAdditions(index) : []),
    ]
        .filter(isDefined)
        .join('/');
}

function getVectorIndexDescriptorAdditions(
    index: VectorIndexDefinition,
): ReadonlyArray<string | undefined> {
    return [
        `metric:${index.params.metric}`,
        `dimension:${index.params.dimension}`,
        `nLists:${index.params.nLists}`,
        index.params.trainingIterations != undefined
            ? `trainingIterations:${index.params.trainingIterations}`
            : undefined,
        index.params.factory != undefined ? `factory:${index.params.factory}` : undefined,
        index.storedValues?.length ? `storedValues:${index.storedValues.join(',')}` : undefined,
    ];
}

function indexDefinitionsEqual(a: IndexDefinition, b: IndexDefinition) {
    if (a.name && b.name && a.name !== b.name) {
        return false;
    }

    if (
        a.rootEntity !== b.rootEntity ||
        a.fields.join('|') !== b.fields.join('|') ||
        a.sparse !== b.sparse ||
        a.type !== b.type
    ) {
        return false;
    }

    if (a.type === 'persistent' && b.type === 'persistent') {
        return a.unique === b.unique;
    }

    if (a.type === 'vector' && b.type === 'vector') {
        return (
            a.params.metric === b.params.metric &&
            a.params.dimension === b.params.dimension &&
            a.params.nLists === b.params.nLists &&
            a.params.trainingIterations === b.params.trainingIterations &&
            a.params.factory === b.params.factory &&
            [...(a.storedValues || [])].sort().join('|') ===
                [...(b.storedValues || [])].sort().join('|')
        );
    }

    return false;
}

export function getRequiredIndicesFromModel(model: Model): ReadonlyArray<IndexDefinition> {
    return model.rootEntityTypes.flatMap((rootEntity) => getIndicesForRootEntity(rootEntity));
}

function getIndicesForRootEntity(rootEntity: RootEntityType): ReadonlyArray<IndexDefinition> {
    const collectionName = getCollectionNameForRootEntity(rootEntity);

    const persistentIndices: ReadonlyArray<PersistentIndexDefinition> = rootEntity.indices.map(
        (index) => ({
            rootEntity,
            collectionName,
            name: index.name,
            fields: index.fields.map(getArangoFieldPath),
            unique: index.unique,
            type: DEFAULT_INDEX_TYPE,
            sparse: index.sparse,
        }),
    );

    const vectorIndices: ReadonlyArray<VectorIndexDefinition> = rootEntity.vectorIndices.map(
        (vectorIndex) => ({
            rootEntity,
            collectionName,
            // name is intentionally left undefined — assigned at migration time based on A/B slot
            fields: [vectorIndex.field.name] as [string],
            sparse: vectorIndex.sparse,
            type: 'vector' as const,
            params: {
                metric: mapMetricForArango(vectorIndex.metric),
                dimension: vectorIndex.dimension || 1,
                nLists: vectorIndex.nLists, // may be undefined (auto-computed)
                trainingIterations: vectorIndex.trainingIterations,
                factory: vectorIndex.factory,
            },
            storedValues: vectorIndex.storedValues,
        }),
    );

    return [...persistentIndices, ...vectorIndices];
}

export function calculateRequiredIndexOperations(
    existingIndices: ReadonlyArray<IndexDefinition>,
    requiredIndices: ReadonlyArray<IndexDefinition>,
    config: ArangoDBConfig,
): {
    persistentIndicesToDelete: ReadonlyArray<IndexDefinition>;
    persistentIndicesToCreate: ReadonlyArray<IndexDefinition>;
} {
    let indicesToDelete = [...existingIndices];
    const indicesToCreate = requiredIndices
        .map((requiredIndex) => {
            const existingIndex = existingIndices.find((index) =>
                indexDefinitionsEqual(index, requiredIndex),
            );
            indicesToDelete = indicesToDelete.filter((index) => index !== existingIndex);
            if (!!existingIndex) {
                return undefined;
            }
            return requiredIndex;
        })
        .filter(isDefined);
    const managedIndexTypes = new Set(requiredIndices.map((index) => index.type));
    indicesToDelete = indicesToDelete
        .filter((index) => managedIndexTypes.has(index.type)) // only remove indexes of types that we also add
        .filter(
            (index) =>
                !index.name ||
                !config.nonManagedIndexNamesPattern ||
                !index.name.match(config.nonManagedIndexNamesPattern),
        );
    return {
        persistentIndicesToDelete: indicesToDelete,
        persistentIndicesToCreate: indicesToCreate,
    };
}

/**
 * Gets the field path of an index prepared for Arango, adding [*] suffix to spread list items on list types
 */
function getArangoFieldPath(indexField: IndexField): string {
    if (
        indexField.declaringType.isRootEntityType &&
        indexField.path.length === 1 &&
        indexField.path[0] === ID_FIELD
    ) {
        // translate to arangodb's id field
        return '_key';
    }

    let segments = (indexField.fieldsInPath || []).map((field) =>
        field.isList ? `${field.name}[*]` : field.name,
    );

    // OffsetDateTime filters / sorts on the timestamp, so we should also index this field
    if (
        indexField.field &&
        indexField.field.type.isScalarType &&
        indexField.field.type.graphQLScalarType === GraphQLOffsetDateTime
    ) {
        segments = [...segments, TIMESTAMP_PROPERTY];
    }

    return segments.join('.');
}

export function mapMetricForArango(metric: string): ArangoVectorSimilarityMetric {
    switch (metric) {
        case 'L2':
            return 'l2';
        case 'INNER_PRODUCT':
            return 'innerProduct';
        case 'COSINE':
        default:
            return 'cosine';
    }
}

/**
 * Computes the recommended nLists value based on the document count.
 * Formula: max(1, min(N, round(15 * sqrt(N))))
 */
export function computeAutoNLists(docCount: number): number {
    if (docCount <= 0) {
        return 1;
    }
    return Math.max(1, Math.min(docCount, Math.round(15 * Math.sqrt(docCount))));
}

export type VectorIndexSlot = 'a' | 'b';

/**
 * Returns the ArangoDB index name for a vector index using the A/B slot naming scheme.
 */
export function vectorIndexSlotName(fieldName: string, slot: VectorIndexSlot): string {
    return `vector_${fieldName}_${slot}`;
}

/**
 * Returns the other slot for A/B naming.
 */
export function otherVectorIndexSlot(slot: VectorIndexSlot): VectorIndexSlot {
    return slot === 'a' ? 'b' : 'a';
}

/**
 * Determines the slot of an existing vector index by its name.
 * Returns undefined if the name does not match the expected pattern.
 */
export function getVectorIndexSlot(indexName: string): VectorIndexSlot | undefined {
    if (indexName.endsWith('_a')) {
        return 'a';
    }
    if (indexName.endsWith('_b')) {
        return 'b';
    }
    return undefined;
}

/**
 * Checks whether the nLists drift between an existing and a new value exceeds the given threshold.
 * The threshold is a fraction (e.g. 0.25 for 25%).
 */
export function nListsDriftExceedsThreshold(
    existingNLists: number,
    newNLists: number,
    threshold: number,
): boolean {
    if (existingNLists <= 0) {
        return true;
    }
    return Math.abs(newNLists - existingNLists) / existingNLists > threshold;
}

/**
 * Checks whether two vector index definitions match on their core identity fields
 * (collection, field, type) but differ in their params.
 */
export function vectorIndexMatchesByField(
    existing: IndexDefinition,
    required: IndexDefinition,
): boolean {
    return (
        existing.type === 'vector' &&
        required.type === 'vector' &&
        existing.rootEntity === required.rootEntity &&
        existing.collectionName === required.collectionName &&
        existing.fields.join('|') === required.fields.join('|')
    );
}
