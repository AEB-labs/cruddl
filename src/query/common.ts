import { GraphQLObjectType, GraphQLScalarType } from 'graphql';
import { ContextQueryNode, FieldQueryNode, QueryNode } from './definition';

export function createScalarFieldValueNode(objectType: GraphQLObjectType, fieldName: string, contextNode: QueryNode = new ContextQueryNode()): QueryNode {
    const field = objectType.getFields()[fieldName];
    if (!field || !(field.type instanceof GraphQLScalarType)) {
        throw new Error(`Field ${fieldName} is not a field of ${objectType.name} with scalar type`);
    }
    return new FieldQueryNode(contextNode, field);
}
