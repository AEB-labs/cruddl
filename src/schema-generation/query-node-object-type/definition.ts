import {
    GraphQLEnumType, GraphQLFieldConfigArgumentMap, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLScalarType,
    Thunk
} from 'graphql';
import { FieldRequest } from '../../graphql/query-distiller';
import { QueryNode } from '../../query-tree';

export interface QueryNodeResolveInfo {
    fieldRequestStack: ReadonlyArray<FieldRequest>
}

export interface QueryNodeField {
    name: string
    description?: string
    type: QueryNodeOutputType
    args?: GraphQLFieldConfigArgumentMap
    resolve: (sourceNode: QueryNode, args: { [name: string]: any }, info: QueryNodeResolveInfo) => QueryNode
}

export interface QueryNodeObjectType {
    name: string
    description?: string
    fields: Thunk<ReadonlyArray<QueryNodeField>>
}

export class QueryNodeNonNullType<T extends QueryNodeNullableType> {
    constructor(public readonly ofType: T) {
    }
}

export class QueryNodeListType<T extends QueryNodeOutputType> {
    constructor(public readonly ofType: T) {
    }
}

export type QueryNodeNamedOutputType = QueryNodeObjectType | GraphQLObjectType | GraphQLEnumType | GraphQLScalarType
export type QueryNodeNullableType = QueryNodeNamedOutputType | QueryNodeListType<any> | GraphQLList<any>
export type QueryNodeOutputType = QueryNodeNullableType | QueryNodeNonNullType<any> | GraphQLNonNull<any>
