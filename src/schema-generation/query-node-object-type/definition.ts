import {
    GraphQLEnumType,
    GraphQLFieldConfigArgumentMap,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLScalarType,
    GraphQLUnionType,
    Thunk
} from 'graphql';
import { QueryNode } from '../../query-tree';
import { FieldContext } from './context';

export interface QueryNodeResolveInfo extends FieldContext {
}

export interface QueryNodeField {
    name: string
    description?: string
    type: QueryNodeOutputType
    args?: GraphQLFieldConfigArgumentMap
    resolve: (sourceNode: QueryNode, args: { [name: string]: any }, info: QueryNodeResolveInfo) => QueryNode
    transform?: (sourceNode: QueryNode, args: { [name: string]: any }, info: QueryNodeResolveInfo) => QueryNode

    /**
     * Indicates whether this field should be resolved in the user-specified sequence among other serial fields
     */
    isSerial?: boolean

    /**
     * If set to `true`, the resolved value is not checked against NULL
     *
     * Normally, fields whose type is an object type evaluate to NULL if the source value is NULL. If this flag is set,
     * NULL is passed to the field resolvers within.
     */
    skipNullCheck?: boolean
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
