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

/**
 * A vector index object with enough information for description, descriptor,
 * and migration use. Satisfied by objects produced from ExistingVectorIndex
 * (with collectionName added) and VectorIndexDefinition (with type: 'vector' added).
 */
export interface DescribableVectorIndex {
    readonly id?: string;
    readonly name?: string;
    readonly type: 'vector';
    readonly collectionName: string;
    readonly fields: ReadonlyArray<string>;
    readonly sparse: boolean;
    readonly params: {
        readonly metric: string;
        readonly dimension: number;
        readonly nLists?: number;
        readonly trainingIterations?: number;
        readonly factory?: string;
    };
    readonly storedValues?: ReadonlyArray<string>;
}

export type IndexDefinition = PersistentIndexDefinition | DescribableVectorIndex;

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
    ]
        .filter(isDefined)
        .join('/');
}

function indexDefinitionsEqual(a: PersistentIndexDefinition, b: PersistentIndexDefinition) {
    if (a.name && b.name && a.name !== b.name) {
        return false;
    }

    if (
        a.collectionName !== b.collectionName ||
        a.fields.join('|') !== b.fields.join('|') ||
        a.sparse !== b.sparse ||
        a.type !== b.type
    ) {
        return false;
    }

    if (a.type === 'persistent' && b.type === 'persistent') {
        return a.unique === b.unique;
    }

    return false;
}

export function getRequiredIndicesFromModel(
    model: Model,
): ReadonlyArray<PersistentIndexDefinition> {
    return model.rootEntityTypes.flatMap((rootEntity) => getIndicesForRootEntity(rootEntity));
}

function getIndicesForRootEntity(
    rootEntity: RootEntityType,
): ReadonlyArray<PersistentIndexDefinition> {
    const collectionName = getCollectionNameForRootEntity(rootEntity);

    return rootEntity.indices.map((index) => ({
        rootEntity,
        collectionName,
        name: index.name,
        fields: index.fields.map(getArangoFieldPath),
        unique: index.unique,
        type: DEFAULT_INDEX_TYPE,
        sparse: index.sparse,
    }));
}

export function calculateRequiredIndexOperations(
    existingIndices: ReadonlyArray<PersistentIndexDefinition>,
    requiredIndices: ReadonlyArray<PersistentIndexDefinition>,
    config: ArangoDBConfig,
): {
    persistentIndicesToDelete: ReadonlyArray<PersistentIndexDefinition>;
    persistentIndicesToCreate: ReadonlyArray<PersistentIndexDefinition>;
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
