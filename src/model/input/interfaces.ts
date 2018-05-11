import { PermissionProfile } from '../../authorization/permission-profile';
import { ValidationResult } from '../validation/index';
import {
    EnumTypeDefinitionNode, FieldNode, ObjectTypeDefinitionNode, ScalarTypeDefinitionNode, TypeDefinitionNode
} from 'graphql';

export interface Field {
    readonly declaringType: ObjectType

    astNode?: FieldNode

    name: string
    type: Type
    isList: boolean
    readonly isSystemField: boolean
    readonly isWritable: boolean

    permissionProfile?: PermissionProfile

    defaultValue?: any

    calcMutationOperators: CalcMutationsOperator[]

    isReference: boolean

    isRelation: boolean
    inverseOf?: Field
    readonly relationInfo?: {
        readonly isInverseField: boolean
        readonly relation: Relation
        readonly inverseIsList: boolean
        readonly inverseField?: Field
    }
}

export interface Relation {
    readonly fromType: RootEntityType
    readonly fromField: Field
    readonly fromCardinality: RelationSideCardinality
    readonly toType: RootEntityType
    readonly toField: Field|undefined
    readonly toCardinality: RelationSideCardinality
    readonly cardinality: RelationCardinality
}

export enum RelationSideCardinality {
    ONE,
    MANY
}

export enum RelationCardinality {
    ONE_TO_ONE,
    ONE_TO_MANY,
    MANY_TO_ONE,
    MANY_TO_MANY
}

export enum TypeKind {
    SCALAR,
    ENUM,
    ROOT_ENTITY,
    CHILD_ENTITY,
    VALUE_OBJECT,
    ENTITY_EXTENSION
}

export interface TypeBase {
    kind: TypeKind
    name: string
    description: string
    isObjectType: boolean
    astNode?: TypeDefinitionNode
}

export type ObjectType = RootEntityType | ValueObjectType | EntityExtensionType | ChildEntityType;
export type Type = ObjectType | EnumType | ScalarType;

export interface ObjectTypeBase extends TypeBase {
    fields: Field[]
    isObjectType: false
    astNode: ObjectTypeDefinitionNode
}

export interface RootEntityType extends ObjectTypeBase {
    kind: TypeKind.ROOT_ENTITY
    readonly namespace: Namespace
    indices: IndexDefinition[]
    keyField?: Field
    permissionProfile: PermissionProfile
}

export interface ValueObjectType extends ObjectTypeBase {
    kind: TypeKind.VALUE_OBJECT
}

export interface ChildEntityType extends ObjectTypeBase {
    kind: TypeKind.CHILD_ENTITY
}

export interface EntityExtensionType extends ObjectTypeBase {
    kind: TypeKind.ENTITY_EXTENSION
}

export interface EnumType extends TypeBase {
    kind: TypeKind.ENUM
    values: string[]
    astNode: EnumTypeDefinitionNode
}

export interface ScalarType extends TypeBase {
    astNode: ScalarTypeDefinitionNode
}

export interface Namespace {
    readonly parent: Namespace|undefined
    readonly isRoot: boolean
    name: string
    readonly fullyQualifiedName: string
    childNamespaces: Namespace[]
    rootEntities: RootEntityType
}

export interface Model {
    rootNamespace: Namespace
    types: Type[]
    permissionProfiles: PermissionProfile[]

    getType<T extends Type>(name: string): T|undefined
    getScalarType(name: string): ScalarType
    getRootEntityType(name: string): RootEntityType|undefined
    getChildEntityType(name: string): ChildEntityType|undefined
    getValueObjectType(name: string): ValueObjectType|undefined
    getEntityExtensionType(name: string): EntityExtensionType|undefined
    getEnumType(name: string): EnumType|undefined
    getScalarType(name: string): ScalarType|undefined
    getPermissionProfile(name: string): PermissionProfile|undefined

    readonly namespaces: Namespace[]
    readonly rootEntityTypes: RootEntityType[]
    readonly valueObjectTypes: ValueObjectType[]
    readonly entityExtensionTypes: EntityExtensionType[]
    readonly childEntityTypes: ChildEntityType[]
    readonly enumTypes: EnumType[]
    readonly scalarTypes: EnumType[]

    validationResult: ValidationResult
}

export interface IndexDefinition {
    id: string,
    fields: string[],
    unique: boolean
}

export enum CalcMutationsOperator {
    MULTIPLY,
    DIVIDE,
    ADD,
    SUBTRACT,
    MODULO,
    APPEND,
    PREPEND
}
