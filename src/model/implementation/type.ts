import { GraphQLString } from 'graphql';
import { TypeConfig, TypeKind } from '../config';
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
    constructor(name: string, model: Model) {
        super(
            {
                kind: TypeKind.SCALAR,
                name,
                graphQLScalarType: GraphQLString
            },
            model
        );
    }
}

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
