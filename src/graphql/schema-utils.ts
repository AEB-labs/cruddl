import {
    GraphQLList,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLType,
    isNonNullType,
    OperationTypeNode,
} from 'graphql';

export function getOperationRootType(
    schema: GraphQLSchema,
    operation: OperationTypeNode,
): GraphQLObjectType | undefined {
    switch (operation) {
        case 'query':
            return schema.getQueryType() || undefined;
        case 'mutation':
            return schema.getMutationType() || undefined;
        case 'subscription':
            return schema.getSubscriptionType() || undefined;
        default:
            return undefined;
    }
}

export function isListTypeIgnoringNonNull(type: GraphQLType): boolean {
    if (isNonNullType(type)) {
        return isListTypeIgnoringNonNull(type.ofType);
    }
    return type instanceof GraphQLList;
}
