import {
    ASTNode, DirectiveNode, EnumTypeDefinitionNode, ObjectTypeDefinitionNode, ObjectValueNode, ScalarTypeDefinitionNode,
    StringValueNode, TypeDefinitionNode
} from 'graphql';
import { FieldConfig } from './field';
import { PermissionsConfig } from './permissions';

export enum TypeKind {
    SCALAR = 'SCALAR',
    ENUM = 'ENUM',
    ROOT_ENTITY = 'ROOT_ENTITY',
    CHILD_ENTITY = 'CHILD_ENTITY',
    VALUE_OBJECT = 'VALUE_OBJECT',
    ENTITY_EXTENSION = 'ENTITY_EXTENSION'
}

export interface TypeConfigBase {
    readonly kind: TypeKind
    readonly name: string
    readonly description?: string
    readonly astNode?: TypeDefinitionNode
}

export interface ObjectTypeConfigBase extends TypeConfigBase {
    readonly fields: ReadonlyArray<FieldConfig>
    readonly astNode?: ObjectTypeDefinitionNode
}

export interface RootEntityTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.ROOT_ENTITY
    readonly namespacePath?: string[]
    readonly indices?: ReadonlyArray<IndexDefinitionConfig>
    readonly keyFieldName?: string
    readonly keyFieldASTNode?: ASTNode
    readonly permissions?: PermissionsConfig
}

export interface ValueObjectTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.VALUE_OBJECT
}

export interface ChildEntityTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.CHILD_ENTITY
}

export interface EntityExtensionTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.ENTITY_EXTENSION
}

export interface EnumTypeConfig extends TypeConfigBase {
    readonly kind: TypeKind.ENUM
    readonly values: ReadonlyArray<string>
    readonly astNode?: EnumTypeDefinitionNode
}

export interface ScalarTypeConfig extends TypeConfigBase {
    readonly kind: TypeKind.SCALAR
    readonly astNode?: ScalarTypeDefinitionNode
}

export interface IndexDefinitionConfig {
    readonly id?: string,
    readonly fields: ReadonlyArray<string>
    readonly fieldASTNodes?: ReadonlyArray<StringValueNode|DirectiveNode|undefined>
    readonly unique: boolean
    readonly astNode?: DirectiveNode|ObjectValueNode
}

export type ObjectTypeConfig = RootEntityTypeConfig|ChildEntityTypeConfig|ValueObjectTypeConfig|EntityExtensionTypeConfig;
export type TypeConfig = ObjectTypeConfig|ScalarTypeConfig|EnumTypeConfig;
