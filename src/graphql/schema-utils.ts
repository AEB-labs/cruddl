import { GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLSchema, GraphQLType, OperationTypeNode } from 'graphql';

export function getOperationRootType(schema: GraphQLSchema, operation: OperationTypeNode): GraphQLObjectType|undefined {
    switch (operation) {
        case 'query':
            return schema.getQueryType();
        case 'mutation':
            return schema.getMutationType() || undefined;
        case 'subscription':
            return schema.getSubscriptionType() || undefined;
        default:
            return undefined;
    }
}

export function isListType(type: GraphQLType): boolean {
    if (type instanceof GraphQLNonNull) {
        return isListType(type.ofType);
    }
    return type instanceof GraphQLList;
}
