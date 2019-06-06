import {
    GraphQLEnumType, GraphQLInterfaceType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType,
    GraphQLScalarType, GraphQLUnionType, isListType, isNonNullType, Thunk
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

export function isListTypeIgnoringNonNull(type: QueryNodeOutputType): boolean {
    if (isNonNullType(type) || type instanceof QueryNodeNonNullType) {
        return isListTypeIgnoringNonNull(type.ofType);
    }
    return isListType(type) || type instanceof QueryNodeListType;
}

export function makeNonNullableList<T extends QueryNodeNullableType>(type: T): QueryNodeNonNullType<QueryNodeListType<QueryNodeNonNullType<T>>> {
    return new QueryNodeNonNullType(new QueryNodeListType(new QueryNodeNonNullType(type)));
}

export function resolveThunk<T>(thunk: Thunk<T>): T {
    return thunk instanceof Function ? thunk() : thunk;
}
