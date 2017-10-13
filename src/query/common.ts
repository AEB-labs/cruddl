import { GraphQLObjectType, GraphQLScalarType } from 'graphql';
import { FieldQueryNode, RootEntityIDQueryNode, QueryNode } from './definition';
import { isRootEntityType } from '../schema/schema-utils';
import { ID_FIELD } from '../schema/schema-defaults';

export function createScalarFieldValueNode(objectType: GraphQLObjectType, fieldName: string, contextNode: QueryNode): QueryNode {
    const field = objectType.getFields()[fieldName];
    if (!field || !(field.type instanceof GraphQLScalarType)) {
        throw new Error(`Field ${fieldName} is not a field of ${objectType.name} with scalar type`);
    }
    if (isRootEntityType(objectType) && field.name == ID_FIELD) {
        return new RootEntityIDQueryNode(contextNode);
    }
    return new FieldQueryNode(contextNode, field);
}
