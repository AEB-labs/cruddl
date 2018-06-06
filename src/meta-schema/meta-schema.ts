import { GraphQLSchema } from 'graphql';
import { IResolvers, makeExecutableSchema } from 'graphql-tools';
import { Model, RootEntityType, TypeKind } from '../model';


const typeDefs = `
  enum TypeKind {
    ROOT_ENTITY, CHILD_ENTITY, ENTITY_EXTENSION, VALUE_OBJECT, ENUM, SCALAR
  }

  type Field {
    name: String
    description: String
    isList: Boolean
    isReference: Boolean
    isRelation: Boolean
    isReadOnly: Boolean
    type: Type
    relation: Relation
  }
  
  type Index {
    id: String
    unique: Boolean
    fields: [IndexField]
    }
    
  type IndexField {
    field: Field
    path: [String]
  }
  
  type Relation {
    fromType: RootEntityType
    fromField: Field
    toType: RootEntityType
    toField: Field
  }

  interface Type {
    name: String
    kind: TypeKind
    description: String
  }
  
  interface ObjectType {
    name: String
    kind: TypeKind
    description: String
    fields: [Field]
  }
  
  type RootEntityType implements ObjectType & Type {
    name: String
    kind: TypeKind
    description: String
    namespace: Namespace
    keyField: Field
    indices: [Index]
    fields: [Field]
    relations: [Relation]
  }
  
  type ChildEntityType implements ObjectType & Type {
    name: String
    kind: TypeKind
    description: String
    fields: [Field]
  }
  
  type EntityExtensionType implements ObjectType & Type {
    name: String
    kind: TypeKind
    description: String
    fields: [Field]
  }
        
  type ValueObjectType implements ObjectType & Type {
    name: String
    kind: TypeKind
    description: String
    fields: [Field]
  }
            
  type ScalarType implements Type {
    name: String
    kind: TypeKind
    description: String
  }
  
  type EnumType implements Type {
    name: String
    kind: TypeKind
    description: String
    values: [String]
  }
  
  type Namespace {
    name: String
    path: [String]
    rootEntityTypes: [RootEntityType]
    childNamespaces: [Namespace]
    isRoot: Boolean
  }

  type Query {
    type(name: String!): Type
    types: [Type],
    rootEntityTypes: [RootEntityType],
    rootEntityType(name: String!): RootEntityType,
    childEntityTypes: [ChildEntityType],
    childEntityType(name: String!): ChildEntityType,
    entityExtensionTypes: [EntityExtensionType],
    entityExtensionType(name: String!): EntityExtensionType,
    valueObjectTypes: [ValueObjectType],
    valueObjectType(name: String!): ValueObjectType,
    scalarTypes: [ScalarType],
    scalarType(name: String!): ScalarType,
    enumTypes: [EnumType]
    enumType(name: String!): EnumType

    namespaces: [Namespace]
    namespace(path: [String!]!): Namespace
    rootNamespace: Namespace
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
            type: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    return model.getType(parameters.name);
                } else {
                    return null;
                }
            },
            rootEntityTypes: () => model.rootEntityTypes,
            rootEntityType: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    try {
                        return model.getRootEntityTypeOrThrow(parameters.name);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            childEntityTypes: () => model.childEntityTypes,
            childEntityType: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    try {
                        return model.getChildEntityTypeOrThrow(parameters.name);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            entityExtensionTypes: () => model.entityExtensionTypes,
            entityExtensionType: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    try {
                        return model.getEntityExtensionTypeOrThrow(parameters.name);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            valueObjectTypes: () => model.valueObjectTypes,
            valueObjectType: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    try {
                        return model.getValueObjectTypeOrThrow(parameters.name);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            scalarTypes: () => model.scalarTypes,
            scalarType: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    try {
                        return model.getScalarTypeOrThrow(parameters.name);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            enumTypes: () => model.enumTypes,
            enumType: (_: any, parameters: any) => {
                if (parameters && parameters.name) {
                    try {
                        return model.getEnumTypeOrThrow(parameters.name);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },
            namespaces: () => model.namespaces,
            rootNamespace: () => model.rootNamespace,
            namespace: (source: {}, {path}: any) => {
                return model.getNamespaceByPath(path);
            }
        },
        Type: {
            __resolveType(obj: any, context: any, info: any) {
                switch (obj.kind) {
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
        },
        ObjectType: {
            __resolveType(obj: any, context: any, info: any) {
                switch (obj.kind) {
                    case TypeKind.ROOT_ENTITY:
                        return 'RootEntityType';
                    case TypeKind.CHILD_ENTITY:
                        return 'ChildEntityType';
                    case TypeKind.ENTITY_EXTENSION:
                        return 'EntityExtensionType';
                    case TypeKind.VALUE_OBJECT:
                        return 'ValueObjectType';
                    default:
                        return 'ScalarType';
                }
            }
        }
    };

    return makeExecutableSchema({
        typeDefs,
        resolvers
    });
}
