import { TypeKind } from '../config/type';
import { Field, Type } from '../implementation';

export function describeTypeKind(kind: TypeKind) {
    switch (kind) {
        case TypeKind.ENUM:
            return 'an enum type';
        case TypeKind.SCALAR:
            // note: it's currently not possible to declare those
            return 'a scalar type';
        case TypeKind.ROOT_ENTITY:
            return 'a root entity type';
        case TypeKind.CHILD_ENTITY:
            return 'a child entity type';
        case TypeKind.ENTITY_EXTENSION:
            return 'an entity extension type';
        case TypeKind.VALUE_OBJECT:
            return 'a value object type';
        default:
            throw new Error(`Unexpected type kind: ${kind as string}`);
    }
}
