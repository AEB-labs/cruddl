import { compact, flatMap } from '../utils/utils';
import { IndexField, Model, RootEntityType } from '../model';

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

export function getRequiredIndicesFromModel(model: Model): ReadonlyArray<IndexDefinition> {
    return flatMap(model.rootEntityTypes, rootEntity => {
        return rootEntity.indices.map(index => ({
            rootEntity,
            id: index.id,
            fields: index.fields.map(getArangoFieldPath),
            unique: index.unique,

            // sic! unique indices should always be sparse so that more than one NULL value is allowed
            // non-unique indices should not be sparse so that filter: { something: null } can use the index
            sparse: index.unique
        }));
    });
}

export function calculateRequiredIndexOperations(existingIndices: ReadonlyArray<IndexDefinition>, requiredIndices: ReadonlyArray<IndexDefinition>):{
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
    return {indicesToDelete, indicesToCreate};
}

/**
 * Gets the field path of an index prepared for Arango, adding [*] suffix to spread list items on list types
 */
function getArangoFieldPath(indexField: IndexField): string {
    return (indexField.fieldsInPath || [])
        .map(field => field.isList ? `${field.name}[*]` : field.name)
        .join('.');
}
