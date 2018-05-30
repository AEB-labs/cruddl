import { makeExecutableSchema } from 'graphql-tools';
import { GraphQLSchema } from 'graphql';
import { Model } from '../model/implementation/model';
import { Type } from '../model/implementation/type';
import { TypeKind } from '../model/input/type';


const typeDefs = `
  type Field {
    name: String
    description: String
    isList: Boolean
    isReference: Boolean
    isRelation: Boolean
    type: Type
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

  union Type = RootEntityType | ChildEntityType | EntityExtensionType | ValueObjectType | ScalarType | EnumType | InvalidType
  
  type RootEntityType {
    name: String
    kind: String
    description: String
    namespacePath: [String]
    keyField: Field
    indices: [Index]
    fields: [Field]
  }
  
  type ChildEntityType {
    name: String
    kind: String
    description: String
    fields: [Field]
  }
  
  type EntityExtensionType {
    name: String
    kind: String
    description: String
    fields: [Field]
  }
  
  type ValueObjectType {
    name: String
    kind: String
    description: String
    fields: [Field]
  }
  
  type ScalarType {
    name: String
    kind: String
    description: String
  }
  
  type InvalidType {
    name: String
    kind: String
  }
  
  type EnumType {
    name: String
    kind: String
    description: String
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
  }
`;

/**
 * Returns an executable GraphQLSchema which allows to query the meta schema of the given model.
 * Allows to query the different kinds of types and entities, their fields, indices, uniqueness, ...
 * @param {Model} model the model holding the information which the the GraphQLSchema will operate on
 * @returns {GraphQLSchema} an executable GraphQLSchema which allows to query the meat schema.
 */
export function getMetaSchema(model: Model): GraphQLSchema{

    const resolvers = {
        Query: {
            types: () => model.types,
            type: (_: any, parameters: any) => {
                if(parameters && parameters.name) {
                    return model.getType(parameters.name);
                }else{
                    return null;
                }
            },
            rootEntityTypes: () => model.rootEntityTypes,
            rootEntityType: (_:any, parameters: any) => {
                if(parameters && parameters.name) {
                    try {
                        return model.getRootEntityTypeOrThrow(parameters.name);
                    }catch(e){
                        return null;
                    }
                }
                return null;
            },
            childEntityTypes: () => model.childEntityTypes,
            childEntityType: (_:any, parameters: any) => {
                if(parameters && parameters.name) {
                    try {
                        return model.getChildEntityTypeOrThrow(parameters.name);
                    }catch(e){
                        return null;
                    }
                }
                return null;
            },
            entityExtensionTypes: () => model.entityExtensionTypes,
            entityExtensionType: (_:any, parameters: any) => {
                if(parameters && parameters.name) {
                    try {
                        return model.getEntityExtensionTypeOrThrow(parameters.name);
                    }catch(e){
                        return null;
                    }
                }
                return null;
            },
            valueObjectTypes: () => model.valueObjectTypes,
            valueObjectType: (_:any, parameters: any) => {
                if(parameters && parameters.name) {
                    try {
                        return model.getValueObjectTypeOrThrow(parameters.name);
                    }catch(e){
                        return null;
                    }
                }
                return null;
            },
            scalarTypes: () => model.scalarTypes,
            scalarType: (_:any, parameters: any) => {
                if(parameters && parameters.name) {
                    try {
                        return model.getScalarTypeOrThrow(parameters.name);
                    }catch(e){
                        return null;
                    }
                }
                return null;
            },
            enumTypes: () => model.enumTypes,
            enumType: (_:any, parameters: any) => {
                if(parameters && parameters.name) {
                    try {
                        return model.getEnumTypeOrThrow(parameters.name);
                    }catch(e){
                        return null;
                    }
                }
                return null;
            }
        },
        Type: {
            __resolveType(obj: any, context: any, info: any) {
                switch(obj.kind) {
                    case TypeKind.ROOT_ENTITY: return "RootEntityType";
                    case TypeKind.CHILD_ENTITY: return "ChildEntityType";
                    case TypeKind.ENTITY_EXTENSION: return "EntityExtensionType";
                    case TypeKind.VALUE_OBJECT: return "ValueObjectType";
                    case TypeKind.ENUM: return "EnumType";
                    case TypeKind.SCALAR: return "ScalarType";
                    default: return "InvalidType";
                }
            }
        },
        InvalidType: {
            kind: (type: Type) => "INVALID_TYPE"
        }
    };

    return makeExecutableSchema({
        typeDefs,
        resolvers,
    });
}