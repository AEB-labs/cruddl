import {
    GraphQLEnumType, GraphQLInterfaceType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType,
    GraphQLScalarType, GraphQLUnionType
} from 'graphql';
import { QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType, QueryNodeOutputType } from './definition';
import { QueryNodeNullableType } from './index';

export function isGraphQLOutputType(type: {}): type is GraphQLOutputType {
    return type instanceof GraphQLObjectType ||
        type instanceof GraphQLScalarType ||
        type instanceof GraphQLEnumType ||
        type instanceof GraphQLUnionType ||
        type instanceof GraphQLInterfaceType ||
        type instanceof GraphQLNonNull ||
        type instanceof GraphQLList;
}

export function extractQueryTreeObjectType(type: QueryNodeOutputType): QueryNodeObjectType|undefined {
    if (isGraphQLOutputType(type)) {
        return undefined;
    }
    if (type instanceof QueryNodeNonNullType || type instanceof QueryNodeListType) {
        return extractQueryTreeObjectType(type.ofType);
    }
    return type;
}

export function isListType(type: QueryNodeOutputType): boolean {
    if (type instanceof GraphQLNonNull || type instanceof QueryNodeNonNullType) {
        return isListType(type.ofType);
    }
    return type instanceof GraphQLList || type instanceof QueryNodeListType;
}

export function makeNonNullableList<T extends QueryNodeNullableType>(type: T): QueryNodeNonNullType<QueryNodeListType<QueryNodeNonNullType<T>>> {
    return new QueryNodeNonNullType(new QueryNodeListType(new QueryNodeNonNullType(type)));
}
