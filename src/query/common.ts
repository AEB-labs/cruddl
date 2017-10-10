import { GraphQLObjectType, GraphQLScalarType } from 'graphql';
import { FieldQueryNode, QueryNode } from './definition';

export function createScalarFieldValueNode(objectType: GraphQLObjectType, fieldName: string, contextNode: QueryNode): QueryNode {
    const field = objectType.getFields()[fieldName];
    if (!field || !(field.type instanceof GraphQLScalarType)) {
        throw new Error(`Field ${fieldName} is not a field of ${objectType.name} with scalar type`);
    }
    return new FieldQueryNode(contextNode, field);
}
