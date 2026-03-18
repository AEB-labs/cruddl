import type { TypeConfig } from '../config/type.js';
import { TypeKind } from '../config/type.js';
import { ChildEntityType } from './child-entity-type.js';
import { EntityExtensionType } from './entity-extension-type.js';
import { EnumType } from './enum-type.js';
import { InvalidType } from './invalid-type.js';
import type { Model } from './model.js';
import { RootEntityType } from './root-entity-type.js';
import type { ScalarType } from './scalar-type.js';
import { ValueObjectType } from './value-object-type.js';

export type ObjectType = RootEntityType | ChildEntityType | EntityExtensionType | ValueObjectType;
export type Type = ObjectType | ScalarType | EnumType;
export { InvalidType };

export function createType(typeInput: TypeConfig, model: Model): Type {
    switch (typeInput.kind) {
        case TypeKind.ROOT_ENTITY:
            return new RootEntityType(typeInput, model);
        case TypeKind.CHILD_ENTITY:
            return new ChildEntityType(typeInput, model);
        case TypeKind.ENTITY_EXTENSION:
            return new EntityExtensionType(typeInput, model);
        case TypeKind.VALUE_OBJECT:
            return new ValueObjectType(typeInput, model);
        case TypeKind.SCALAR:
            throw new Error(`Custom scalar types are not yet supported`);
        case TypeKind.ENUM:
            return new EnumType(typeInput, model);
        default:
            throw new Error(`Unknown type kind: ${(typeInput as any).kind}`);
    }
}
