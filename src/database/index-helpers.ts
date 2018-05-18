import { compact, flatMap } from '../utils/utils';
import { IndexField, Model, RootEntityType } from '../model';

export interface IndexDefinition {
    id?: string,
    rootEntity: RootEntityType,
    fields: ReadonlyArray<string>,
    unique: boolean
}

export function getRequiredIndicesFromModel(model: Model): ReadonlyArray<IndexDefinition> {
    return flatMap(model.rootEntityTypes, rootEntity => {
        return rootEntity.indices.map(index => ({
            rootEntity,
            id: index.id,
            fields: index.fields.map(getArangoFieldPath),
            unique: index.unique
        }));
    });
}

export function calculateRequiredIndexOperations(existingIndices: ReadonlyArray<IndexDefinition>, requiredIndices: ReadonlyArray<IndexDefinition>):{
    indicesToDelete: ReadonlyArray<IndexDefinition>,
    indicesToCreate: ReadonlyArray<IndexDefinition>
} {
    let indicesToDelete = [...existingIndices];
    const indicesToCreate = compact(requiredIndices.map(requiredIndex => {
        const existingIndex = existingIndices.find(index => index.fields.join('|') === requiredIndex.fields.join('|') && index.unique === requiredIndex.unique);
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
