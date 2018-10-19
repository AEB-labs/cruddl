import { IndexField, Model, RootEntityType } from '../model';
import { ID_FIELD } from '../schema/constants';
import { compact, flatMap } from '../utils/utils';

export interface IndexDefinition {
    id?: string,
    rootEntity: RootEntityType,
    fields: ReadonlyArray<string>,
    unique: boolean
    sparse: boolean
}

function indexDefinitionsEqual(a: IndexDefinition, b: IndexDefinition) {
    return a.rootEntity === b.rootEntity && a.fields.join('|') === b.fields.join('|') && a.unique === b.unique && a.sparse === b.sparse;
}

export function getRequiredIndicesFromModel(model: Model, { shouldUseWorkaroundForSparseIndices = false }: { shouldUseWorkaroundForSparseIndices?: boolean } = {}): ReadonlyArray<IndexDefinition> {
    return flatMap(model.rootEntityTypes, rootEntity => getIndicesForRootEntity(rootEntity, { shouldUseWorkaroundForSparseIndices }));
}

function getIndicesForRootEntity(rootEntity: RootEntityType, options: { shouldUseWorkaroundForSparseIndices: boolean }): ReadonlyArray<IndexDefinition> {
    const indices: IndexDefinition[] = rootEntity.indices.map(index => ({
        rootEntity,
        id: index.id,
        fields: index.fields.map(getArangoFieldPath),
        unique: index.unique,

        // sic! unique indices should always be sparse so that more than one NULL value is allowed
        // non-unique indices should not be sparse so that filter: { something: null } can use the index
        sparse: index.unique
    }));

    if (options.shouldUseWorkaroundForSparseIndices && rootEntity.keyField) {
        // add a non-sparse index to be used for @reference lookups if arangodb does not support dynamic usage of sparse
        // indices yet
        const newIndex: IndexDefinition = {
            rootEntity,
            fields: [rootEntity.keyField.name],

            sparse: false,
            unique: false
        };

        if (!indices.some(index => indexStartsWith(index, newIndex))) {
            indices.push(newIndex);
        }
    }

    return indices;
}

function indexStartsWith(index: IndexDefinition, prefix: IndexDefinition) {
    if (index.sparse !== prefix.sparse || index.unique !== prefix.unique || index.rootEntity !== prefix.rootEntity) {
        return false;
    }
    if (index.fields.length < prefix.fields.length) {
        return false;
    }
    for (let i = 0; i < prefix.fields.length; i++) {
        if (index.fields[i] !== prefix.fields[i]) {
            return false;
        }
    }
    return true;
}

export function calculateRequiredIndexOperations(existingIndices: ReadonlyArray<IndexDefinition>, requiredIndices: ReadonlyArray<IndexDefinition>): {
    indicesToDelete: ReadonlyArray<IndexDefinition>,
    indicesToCreate: ReadonlyArray<IndexDefinition>
} {
    let indicesToDelete = [...existingIndices];
    const indicesToCreate = compact(requiredIndices.map(requiredIndex => {
        const existingIndex = existingIndices.find(index => indexDefinitionsEqual(index, requiredIndex));
        indicesToDelete = indicesToDelete.filter(index => index !== existingIndex);
        if (!!existingIndex) {
            return undefined;
        }
        return requiredIndex;
    }));
    return { indicesToDelete, indicesToCreate };
}

/**
 * Gets the field path of an index prepared for Arango, adding [*] suffix to spread list items on list types
 */
function getArangoFieldPath(indexField: IndexField): string {
    if (indexField.declaringType.isRootEntityType && indexField.path.length === 1 && indexField.path[0] === ID_FIELD) {
        // translate to arangodb's id field
        return '_key';
    }

    return (indexField.fieldsInPath || [])
        .map(field => field.isList ? `${field.name}[*]` : field.name)
        .join('.');
}
