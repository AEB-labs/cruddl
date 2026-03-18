import { RelationDeleteAction } from '../config/field.js';
import type { Field } from '../implementation/field.js';
import type { RootEntityType } from '../implementation/root-entity-type.js';

export function findRecursiveCascadePath(field: Field): ReadonlyArray<Field> | undefined {
    if (!field.type.isRootEntityType) {
        return [];
    }
    return findRecursiveCascadePath0(field.type, [field]);
}

function findRecursiveCascadePath0(
    type: RootEntityType,
    fieldPath: ReadonlyArray<Field>,
): ReadonlyArray<Field> | undefined {
    for (const field of type.fields) {
        if (
            !field.isRelation ||
            !field.type.isRootEntityType ||
            field.inverseOf ||
            field.relationDeleteAction !== RelationDeleteAction.CASCADE
        ) {
            continue;
        }

        if (fieldPath.includes(field)) {
            return fieldPath;
        }

        const result = findRecursiveCascadePath0(field.type, [...fieldPath, field]);
        if (result) {
            return result;
        }
    }
    return undefined;
}
