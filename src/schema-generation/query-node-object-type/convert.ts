import { GraphQLFieldConfig, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType } from 'graphql';
import { aliasBasedResolver } from '../../graphql/alias-based-resolvers';
import { QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType, QueryNodeOutputType } from './definition';
import { isGraphQLOutputType } from './utils';
import { chain } from 'lodash';

export function convertToGraphQLObjectType(type: QueryNodeObjectType): GraphQLObjectType {
    return new GraphQLObjectType({
        name: type.name,
        description: type.description,
        fields: chain(type.fields)
            .keyBy(field => field.name)
            .mapValues((field): GraphQLFieldConfig<any, any> => ({
                description: field.description,
                args: field.args,
                resolve: aliasBasedResolver,
                type: convertToGraphQLType(field.type)
            })).value()
    });
}

export function convertToGraphQLType(type: QueryNodeOutputType): GraphQLOutputType {
    if (isGraphQLOutputType(type)) {
        return type;
    }

    if (type instanceof QueryNodeNonNullType) {
        return new GraphQLNonNull(convertToGraphQLType(type.ofType));
    }

    if (type instanceof QueryNodeListType) {
        return new GraphQLList(convertToGraphQLType(type.ofType));
    }

    return convertToGraphQLObjectType(type);
}
