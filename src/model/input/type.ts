import {
    ASTNode,
    DirectiveNode,
    EnumTypeDefinitionNode,
    ObjectTypeDefinitionNode,
    ObjectValueNode,
    ScalarTypeDefinitionNode,
    StringValueNode,
    TypeDefinitionNode
} from 'graphql';
import { FieldInput } from './field';
import { PermissionsInput } from './permissions';

export enum TypeKind {
    SCALAR = 'SCALAR',
    ENUM = 'ENUM',
    ROOT_ENTITY = 'ROOT_ENTITY',
    CHILD_ENTITY = 'CHILD_ENTITY',
    VALUE_OBJECT = 'VALUE_OBJECT',
    ENTITY_EXTENSION = 'ENTITY_EXTENSION'
}

export interface TypeInputBase {
    readonly kind: TypeKind
    readonly name: string
    readonly description?: string
    readonly astNode?: TypeDefinitionNode
}

export interface ObjectTypeInputBase extends TypeInputBase {
    readonly fields: ReadonlyArray<FieldInput>
    readonly astNode?: ObjectTypeDefinitionNode
}

export interface RootEntityTypeInput extends ObjectTypeInputBase {
    readonly kind: TypeKind.ROOT_ENTITY
    readonly namespacePath?: string[]
    readonly indices?: ReadonlyArray<IndexDefinitionInput>
    readonly keyFieldName?: string
    readonly keyFieldASTNode?: ASTNode
    readonly permissions?: PermissionsInput
}

export interface ValueObjectTypeInput extends ObjectTypeInputBase {
    readonly kind: TypeKind.VALUE_OBJECT
}

export interface ChildEntityTypeInput extends ObjectTypeInputBase {
    readonly kind: TypeKind.CHILD_ENTITY
}

export interface EntityExtensionTypeInput extends ObjectTypeInputBase {
    readonly kind: TypeKind.ENTITY_EXTENSION
}

export interface EnumTypeInput extends TypeInputBase {
    readonly kind: TypeKind.ENUM
    readonly values: ReadonlyArray<string>
    readonly astNode?: EnumTypeDefinitionNode
}

export interface ScalarTypeInput extends TypeInputBase {
    readonly kind: TypeKind.SCALAR
    readonly astNode?: ScalarTypeDefinitionNode
}

export interface IndexDefinitionInput {
    readonly id?: string,
    readonly fields: ReadonlyArray<string>
    readonly fieldASTNodes?: ReadonlyArray<StringValueNode|undefined>
    readonly unique: boolean
    readonly astNode?: DirectiveNode|ObjectValueNode
}

export type ObjectTypeInput = RootEntityTypeInput|ChildEntityTypeInput|ValueObjectTypeInput|EntityExtensionTypeInput;
export type TypeInput = ObjectTypeInput|ScalarTypeInput|EnumTypeInput;
