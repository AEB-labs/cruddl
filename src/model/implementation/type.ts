import { TypeInput, TypeKind } from '../input';
import { RootEntityType } from './root-entity-type';
import { ScalarType } from './scalar-type';
import { ChildEntityType } from './child-entity-type';
import { EntityExtensionType } from './entity-extension-type';
import { ValueObjectType } from './value-object-type';
import { EnumType } from './enum-type';
import { Model } from './model';

export type ObjectType = RootEntityType | ChildEntityType | EntityExtensionType | ValueObjectType;
export type Type = ObjectType | ScalarType | EnumType;

export class InvalidType extends ScalarType {
    constructor(name: string) {
        super({
            kind: TypeKind.SCALAR,
            name
        })
    }
}

export function createType(typeInput: TypeInput, model: Model): Type {
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
            return new ScalarType(typeInput);
        case TypeKind.ENUM:
            return new EnumType(typeInput);
        default:
            throw new Error(`Unknown type kind: ${(typeInput as any).kind}`)
    }
}
