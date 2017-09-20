import { GraphQLObjectType, GraphQLSchema, OperationTypeNode } from 'graphql';

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
