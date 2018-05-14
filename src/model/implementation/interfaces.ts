import { PermissionProfile } from '../../authorization/permission-profile';
import { ValidationResult } from '../validation/index';
import {
    EnumTypeDefinitionNode, FieldNode, ObjectTypeDefinitionNode, ScalarTypeDefinitionNode, TypeDefinitionNode
} from 'graphql';

interface Field {
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

interface Relation {
    readonly fromType: RootEntityType
    readonly fromField: Field
    readonly fromCardinality: RelationSideCardinality
    readonly toType: RootEntityType
    readonly toField: Field|undefined
    readonly toCardinality: RelationSideCardinality
    readonly cardinality: RelationCardinality
}

enum RelationSideCardinality {
    ONE,
    MANY
}

enum RelationCardinality {
    ONE_TO_ONE,
    ONE_TO_MANY,
    MANY_TO_ONE,
    MANY_TO_MANY
}

enum TypeKind {
    SCALAR,
    ENUM,
    ROOT_ENTITY,
    CHILD_ENTITY,
    VALUE_OBJECT,
    ENTITY_EXTENSION
}

interface TypeBase {
    kind: TypeKind
    name: string
    description: string
    isObjectType: boolean
    astNode?: TypeDefinitionNode
}

type ObjectType = RootEntityType | ValueObjectType | EntityExtensionType | ChildEntityType;
type Type = ObjectType | EnumType | ScalarType;

interface ObjectTypeBase extends TypeBase {
    fields: Field[]
    isObjectType: false
    astNode: ObjectTypeDefinitionNode
}

interface RootEntityType extends ObjectTypeBase {
    kind: TypeKind.ROOT_ENTITY
    readonly namespace: Namespace
    indices: IndexDefinition[]
    keyField?: Field
    permissionProfile: PermissionProfile
}

interface ValueObjectType extends ObjectTypeBase {
    kind: TypeKind.VALUE_OBJECT
}

interface ChildEntityType extends ObjectTypeBase {
    kind: TypeKind.CHILD_ENTITY
}

interface EntityExtensionType extends ObjectTypeBase {
    kind: TypeKind.ENTITY_EXTENSION
}

interface EnumType extends TypeBase {
    kind: TypeKind.ENUM
    values: string[]
    astNode: EnumTypeDefinitionNode
}

interface ScalarType extends TypeBase {
    astNode: ScalarTypeDefinitionNode
}

interface Namespace {
    readonly parent: Namespace|undefined
    readonly isRoot: boolean
    name: string
    readonly fullyQualifiedName: string
    childNamespaces: Namespace[]
    rootEntities: RootEntityType
}

interface Model {
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

interface IndexDefinition {
    id: string,
    fields: string[],
    unique: boolean
}

enum CalcMutationsOperator {
    MULTIPLY,
    DIVIDE,
    ADD,
    SUBTRACT,
    MODULO,
    APPEND,
    PREPEND
}
