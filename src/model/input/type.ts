import {
    DirectiveNode, EnumTypeDefinitionNode, ObjectTypeDefinitionNode, ScalarTypeDefinitionNode, TypeDefinitionNode
} from 'graphql';
import { FieldInput } from './field';
import { PermissionsInput } from './permissions';

export enum TypeKind {
    SCALAR,
    ENUM,
    ROOT_ENTITY,
    CHILD_ENTITY,
    VALUE_OBJECT,
    ENTITY_EXTENSION
}

export interface TypeInputBase {
    kind: TypeKind
    name: string
    description?: string
    astNode?: TypeDefinitionNode
}

export interface ObjectTypeInputBase extends TypeInputBase {
    fields: FieldInput[]
    astNode?: ObjectTypeDefinitionNode
}

export interface RootEntityTypeInput extends ObjectTypeInputBase {
    kind: TypeKind.ROOT_ENTITY
    namespacePath?: string[]
    indices?: IndexDefinitionInput[]
    keyFieldName?: string
    permissions?: PermissionsInput
}

export interface ValueObjectTypeInput extends ObjectTypeInputBase {
    kind: TypeKind.VALUE_OBJECT
}

export interface ChildEntityTypeInput extends ObjectTypeInputBase {
    kind: TypeKind.CHILD_ENTITY
}

export interface EntityExtensionTypeInput extends ObjectTypeInputBase {
    kind: TypeKind.ENTITY_EXTENSION
}

export interface EnumTypeInput extends TypeInputBase {
    kind: TypeKind.ENUM
    values: string[]
    astNode?: EnumTypeDefinitionNode
}

export interface ScalarTypeInput extends TypeInputBase {
    kind: TypeKind.SCALAR
    astNode?: ScalarTypeDefinitionNode
}

export interface IndexDefinitionInput {
    id: string,
    fields: string[]
    unique: boolean
    astNode?: DirectiveNode
}

export type ObjectTypeInput = RootEntityTypeInput|ChildEntityTypeInput|ValueObjectTypeInput|EntityExtensionTypeInput;
export type TypeInput = ObjectTypeInput|ScalarTypeInput|EnumTypeInput;
