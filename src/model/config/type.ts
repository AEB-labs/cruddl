import {
    ASTNode,
    EnumTypeDefinitionNode,
    EnumValueDefinitionNode,
    GraphQLScalarType,
    ObjectTypeDefinitionNode,
    ScalarTypeDefinitionNode,
    TypeDefinitionNode,
} from 'graphql';
import { FixedPointDecimalInfo } from '../implementation/scalar-type';
import { FieldConfig, FlexSearchLanguage } from './field';
import { FlexSearchIndexConfig, IndexDefinitionConfig } from './indices';
import { TypeModuleSpecificationConfig } from './module-specification';
import { PermissionsConfig } from './permissions';

export enum TypeKind {
    SCALAR = 'SCALAR',
    ENUM = 'ENUM',
    ROOT_ENTITY = 'ROOT_ENTITY',
    CHILD_ENTITY = 'CHILD_ENTITY',
    VALUE_OBJECT = 'VALUE_OBJECT',
    ENTITY_EXTENSION = 'ENTITY_EXTENSION',
}

export interface TypeConfigBase {
    readonly kind: TypeKind;
    readonly name: string;
    readonly isBuiltinType?: boolean;
    readonly namespacePath?: ReadonlyArray<string>;
    readonly description?: string;
    readonly astNode?: TypeDefinitionNode;
    readonly flexSearchLanguage?: FlexSearchLanguage;
    readonly moduleSpecification?: TypeModuleSpecificationConfig;
}

export interface ObjectTypeConfigBase extends TypeConfigBase {
    readonly fields: ReadonlyArray<FieldConfig>;
    readonly astNode?: ObjectTypeDefinitionNode;
}

export interface RootEntityTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.ROOT_ENTITY;
    readonly indices?: ReadonlyArray<IndexDefinitionConfig>;
    readonly keyFieldName?: string;
    readonly keyFieldASTNode?: ASTNode;
    readonly permissions?: PermissionsConfig;
    readonly flexSearchIndexConfig?: FlexSearchIndexConfig;
    readonly isBusinessObject?: boolean;
}

export interface ValueObjectTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.VALUE_OBJECT;
}

export interface ChildEntityTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.CHILD_ENTITY;
}

export interface EntityExtensionTypeConfig extends ObjectTypeConfigBase {
    readonly kind: TypeKind.ENTITY_EXTENSION;
}

export interface EnumTypeConfig extends TypeConfigBase {
    readonly kind: TypeKind.ENUM;
    readonly values: ReadonlyArray<EnumValueConfig>;
    readonly astNode?: EnumTypeDefinitionNode;
}

export interface EnumValueConfig {
    readonly value: string;
    readonly description?: string;
    readonly deprecationReason?: string;
    readonly astNode?: EnumValueDefinitionNode;
}

export interface ScalarTypeConfig extends TypeConfigBase {
    readonly kind: TypeKind.SCALAR;
    readonly astNode?: ScalarTypeDefinitionNode;
    readonly graphQLScalarType: GraphQLScalarType;

    /**
     * If `true`, this type is considered compatible with the javascript number type
     */
    readonly isNumberType?: boolean;

    readonly fixedPointDecimalInfo?: FixedPointDecimalInfo;
}

export type ObjectTypeConfig =
    | RootEntityTypeConfig
    | ChildEntityTypeConfig
    | ValueObjectTypeConfig
    | EntityExtensionTypeConfig;
export type TypeConfig = ObjectTypeConfig | ScalarTypeConfig | EnumTypeConfig;
