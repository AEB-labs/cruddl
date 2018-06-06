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
        isList: Boolean!
        isReference: Boolean!
        isRelation: Boolean!
        isReadOnly: Boolean!
        type: Type!
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
        namespace: Namespace!
        keyField: Field
        indices: [Index!]!
        fields: [Field!]!
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
        values: [String!]!
    }

    type Namespace {
        name: String
        path: [String!]!
        rootEntityTypes: [RootEntityType!]!
        childNamespaces: [Namespace!]!
        isRoot: Boolean!
    }

    type Query {
        types: [Type!]!
        type(name: String!): Type
        rootEntityTypes: [RootEntityType!]!
        rootEntityType(name: String!): RootEntityType
        childEntityTypes: [ChildEntityType!]!
        childEntityType(name: String!): ChildEntityType
        entityExtensionTypes: [EntityExtensionType!]!
        entityExtensionType(name: String!): EntityExtensionType
        valueObjectTypes: [ValueObjectType!]!
        valueObjectType(name: String!): ValueObjectType
        scalarTypes: [ScalarType!]!
        scalarType(name: String!): ScalarType
        enumTypes: [EnumType!]!
        enumType(name: String!): EnumType
        
        namespaces: [Namespace!]!
        namespace(path: [String!]!): Namespace
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
