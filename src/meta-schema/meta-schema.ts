import { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { IResolvers, makeExecutableSchema } from 'graphql-tools';
import { Model, RootEntityType, Type, TypeKind } from '../model';

const typeDefs = gql`
    enum TypeKind {
        ROOT_ENTITY, CHILD_ENTITY, ENTITY_EXTENSION, VALUE_OBJECT, ENUM, SCALAR
    }

    type Field {
        name: String!
        description: String
        
        "Indicates if this field is a list."
        isList: Boolean!
        
        "Indicates if this field references a root entity by its key field."
        isReference: Boolean!
        
        "Indicates if this field defines a relation."
        isRelation: Boolean!
        
        "If \`false\`, this field can not be set in *create* or *update* mutations."
        isReadOnly: Boolean!

        "If \`true\`, this field is defined by the system, otherwise, by the schema."
        isSystemField: Boolean!
        
        "The type for the field's value"
        type: Type!
        
        "Relation information, if \`isRelation\` is \`true\`, \`null\` otherwise"
        relation: Relation
    }

    type Index {
        id: String
        unique: Boolean!
        fields: [IndexField!]!
    }

    type IndexField {
        field: Field!
        path: [String!]!
    }

    type Relation {
        fromType: RootEntityType!
        fromField: Field!
        toType: RootEntityType!
        toField: Field
    }

    interface Type {
        name: String!
        kind: TypeKind!
        description: String
    }

    interface ObjectType {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
    }

    type RootEntityType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        
        "The namespace this type is declared in"
        namespace: Namespace!
        
        "The field by which objects of this type can be referenced (optional)"
        keyField: Field
        
        "A list of database indices"
        indices: [Index!]!
        
        fields: [Field!]!
        
        """
        All relations between this type and other types
        
        This also contains relations that are not declared by a field on this type, but by a field on the target type.
        """
        relations: [Relation!]!
    }

    type ChildEntityType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
    }

    type EntityExtensionType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
    }

    type ValueObjectType implements ObjectType & Type {
        name: String!
        kind: TypeKind!
        description: String
        fields: [Field!]!
    }

    type ScalarType implements Type {
        name: String!
        kind: TypeKind!
        description: String
    }

    type EnumType implements Type {
        name: String!
        kind: TypeKind!
        description: String
        values: [EnumValue!]!
    }
    
    type EnumValue {
        value: String!
        description: String
    }

    type Namespace {
        "The name of this namespace, i.e., the last path segment"
        name: String
        
        "The namespace path segments"
        path: [String!]!
        
        "All root entity types declared directly in this namespace"
        rootEntityTypes: [RootEntityType!]!
        
        "All direct child namespaces"
        childNamespaces: [Namespace!]!
        
        "\`true\` if this is the root namespace"
        isRoot: Boolean!
    }

    """
    Provides meta information about types and fields
    
    This differs from the GraphQL introspection types like \`__Schema\` in that it excludes auto-generated types and
    fields like input types or the \`count\` field for lists, and it provides additional type information like type
    kinds and relations.
    """
    type Query {
        "A list of all user-defined and system-provided types"
        types: [Type!]!
        
        "Finds a type by its name"
        type(name: String!): Type
        
        "A list of all root entity types in all namespaces"
        rootEntityTypes: [RootEntityType!]!
        
        """
        Finds a root entity type by its name.
        
        Returns \`null\` if the type does not exist or is not a root entity type.
        """
        rootEntityType(name: String!): RootEntityType
        
        "A list of all child entity types"
        childEntityTypes: [ChildEntityType!]!
        
        """
        Finds a child entity type by its name.
        
        Returns \`null\` if the type does not exist or is not a child entity type.
        """
        childEntityType(name: String!): ChildEntityType
        
        "A list of all entity extension types"
        entityExtensionTypes: [EntityExtensionType!]!

        """
        Finds an entity extension type by its name.

        Returns \`null\` if the type does not exist or is not an entity extension type.
        """
        entityExtensionType(name: String!): EntityExtensionType
        
        "A list of all value object types"
        valueObjectTypes: [ValueObjectType!]!

        """
        Finds a value object type by its name.

        Returns \`null\` if the type does not exist or is not a value object type.
        """
        valueObjectType(name: String!): ValueObjectType
        
        "A list of all scalar types, including predefined ones."
        scalarTypes: [ScalarType!]!
        
        """
        Finds a scalar type by its name.

        Returns \`null\` if the type does not exist or is not a scalar type.
        """
        scalarType(name: String!): ScalarType
        
        "A list of all enum types"
        enumTypes: [EnumType!]!
        
        """
        Finds an enum type by its name.

        Returns \`null\` if the type does not exist or is not an enum type.
        """
        enumType(name: String!): EnumType
        
        "A list of all namespaces (including nested ones)"
        namespaces: [Namespace!]!
        
        """Finds a namespace by its path segments"""
        namespace("The path segments, e.g. \`[\\"logistics\\", \\"packaging\\"]\`" path: [String!]!): Namespace
        
        "The root namespace"
        rootNamespace: Namespace!
    }
`;

/**
 * Returns an executable GraphQLSchema which allows to query the meta schema of the given model.
 * Allows to query the different kinds of types and entities, their fields, indices, uniqueness, ...
 * @param {Model} model the model holding the information which the the GraphQLSchema will operate on
 * @returns {GraphQLSchema} an executable GraphQLSchema which allows to query the meat schema.
 */
export function getMetaSchema(model: Model): GraphQLSchema {
    const resolvers: IResolvers<{}, {}> = {
        Query: {
            types: () => model.types,
            type: (_, {name}) => model.getType(name),
            rootEntityTypes: () => model.rootEntityTypes,
            rootEntityType: (_, {name}) => model.getRootEntityType(name),
            childEntityTypes: () => model.childEntityTypes,
            childEntityType: (_, {name}) => model.getChildEntityType(name),
            entityExtensionTypes: () => model.entityExtensionTypes,
            entityExtensionType: (_, {name}) => model.getEntityExtensionType(name),
            valueObjectTypes: () => model.valueObjectTypes,
            valueObjectType: (_, {name}) => model.getValueObjectType(name),
            scalarTypes: () => model.scalarTypes,
            scalarType: (_, {name}) => model.getScalarType(name),
            enumTypes: () => model.enumTypes,
            enumType: (_, {name}) => model.getEnumType(name),
            namespaces: () => model.namespaces,
            rootNamespace: () => model.rootNamespace,
            namespace: (_, {path}) => model.getNamespaceByPath(path)
        },
        Type: {
            __resolveType: type => resolveType(type as Type)
        },
        ObjectType: {
            __resolveType: type => resolveType(type as Type)
        }
    };

    return makeExecutableSchema({
        typeDefs,
        resolvers
    });
}

function resolveType(type: Type): string {
    switch (type.kind) {
        case TypeKind.ROOT_ENTITY:
            return 'RootEntityType';
        case TypeKind.CHILD_ENTITY:
            return 'ChildEntityType';
        case TypeKind.ENTITY_EXTENSION:
            return 'EntityExtensionType';
        case TypeKind.VALUE_OBJECT:
            return 'ValueObjectType';
        case TypeKind.ENUM:
            return 'EnumType';
        case TypeKind.SCALAR:
            return 'ScalarType';
        default:
            return 'ScalarType';
    }
}
