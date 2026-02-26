import { IndexField, Model, RootEntityType } from '../../../model';
import { ID_FIELD } from '../../../schema/constants';
import {
    GraphQLOffsetDateTime,
    TIMESTAMP_PROPERTY,
} from '../../../schema/scalars/offset-date-time';
import { compact, flatMap } from '../../../utils/utils';
import { getCollectionNameForRootEntity } from '../arango-basics';
import { ArangoDBConfig } from '../config';

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
    readonly id?: string;
    readonly name?: string;
    readonly rootEntity: RootEntityType;
    readonly fields: [string];
    readonly collectionName: string;
    readonly sparse: boolean;
    readonly type: 'vector';
    readonly params: {
        readonly metric: ArangoVectorSimilarityMetric;
        readonly dimension: number;
        readonly nLists: number;
        readonly defaultNProbe?: number;
        readonly trainingIterations?: number;
        readonly factory?: string;
    };
    readonly storedValues?: ReadonlyArray<string>;
}

export type IndexDefinition = PersistentIndexDefinition | VectorIndexDefinition;

export function describeIndex(index: IndexDefinition) {
    const indexTypePrefix = index.type === 'persistent' && index.unique ? 'unique ' : '';
    const sparsePrefix = index.sparse ? 'sparse ' : '';
    return `${indexTypePrefix}${sparsePrefix}${index.type} index${
        index.name ? ` "${index.name}"` : index.id ? ' ' + index.id : ''
    } on collection ${index.collectionName} on ${
        index.fields.length > 1 ? 'fields' : 'field'
    } '${index.fields.join(',')}'`;
}

export function getIndexDescriptor(index: IndexDefinition) {
    return compact([
        index.id, // contains collection and id separated by slash (missing for indices to be created)
        index.name, // name as specified by user
        `type:${index.type}`,
        index.type === 'persistent' && index.unique ? 'unique' : undefined,
        index.sparse ? 'sparse' : undefined,
        `collection:${index.collectionName}`,
        `fields:${index.fields.join(',')}`,
        ...(index.type === 'vector' ? getVectorIndexDescriptorAdditions(index) : []),
    ]).join('/');
}

function getVectorIndexDescriptorAdditions(
    index: VectorIndexDefinition,
): ReadonlyArray<string | undefined> {
    return [
        `metric:${index.params.metric}`,
        `dimension:${index.params.dimension}`,
        `nLists:${index.params.nLists}`,
        index.params.defaultNProbe != undefined
            ? `defaultNProbe:${index.params.defaultNProbe}`
            : undefined,
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
            a.params.defaultNProbe === b.params.defaultNProbe &&
            a.params.trainingIterations === b.params.trainingIterations &&
            a.params.factory === b.params.factory &&
            (a.storedValues || []).join('|') === (b.storedValues || []).join('|')
        );
    }

    return false;
}

export function getRequiredIndicesFromModel(model: Model): ReadonlyArray<IndexDefinition> {
    return flatMap(model.rootEntityTypes, (rootEntity) => getIndicesForRootEntity(rootEntity));
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
            name: vectorIndex.name,
            fields: [vectorIndex.field.path.join('.')] as [string],
            sparse: vectorIndex.sparse,
            type: 'vector',
            params: {
                metric: mapMetricForArango(vectorIndex.metric),
                dimension: vectorIndex.dimension || 1,
                nLists: vectorIndex.nLists || 1,
                defaultNProbe: vectorIndex.defaultNProbe,
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
    indicesToDelete: ReadonlyArray<IndexDefinition>;
    indicesToCreate: ReadonlyArray<IndexDefinition>;
} {
    let indicesToDelete = [...existingIndices];
    const indicesToCreate = compact(
        requiredIndices.map((requiredIndex) => {
            const existingIndex = existingIndices.find((index) =>
                indexDefinitionsEqual(index, requiredIndex),
            );
            indicesToDelete = indicesToDelete.filter((index) => index !== existingIndex);
            if (!!existingIndex) {
                return undefined;
            }
            return requiredIndex;
        }),
    );
    const managedIndexTypes = new Set(requiredIndices.map((index) => index.type));
    indicesToDelete = indicesToDelete
        .filter((index) => managedIndexTypes.has(index.type)) // only remove indexes of types that we also add
        .filter(
            (index) =>
                !index.name ||
                !config.nonManagedIndexNamesPattern ||
                !index.name.match(config.nonManagedIndexNamesPattern),
        );
    return { indicesToDelete, indicesToCreate };
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

function mapMetricForArango(metric: string): ArangoVectorSimilarityMetric {
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
