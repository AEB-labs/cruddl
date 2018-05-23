import { GraphQLFieldConfig, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType } from 'graphql';
import { chain } from 'lodash';
import memorize from 'memorize-decorator';
import { aliasBasedResolver } from '../../graphql/alias-based-resolvers';
import { QueryNodeListType, QueryNodeNonNullType, QueryNodeObjectType, QueryNodeOutputType } from './definition';
import { isGraphQLOutputType } from './utils';

export class QueryNodeObjectTypeConverter {
    @memorize()
    convertToGraphQLObjectType(type: QueryNodeObjectType): GraphQLObjectType {
        return new GraphQLObjectType({
            name: type.name,
            description: type.description,
            fields: chain(type.fields)
                .keyBy(field => field.name)
                .mapValues((field): GraphQLFieldConfig<any, any> => ({
                    description: field.description,
                    args: field.args,
                    resolve: aliasBasedResolver,
                    type: this.convertToGraphQLType(field.type)
                })).value()
        });
    }

    convertToGraphQLType(type: QueryNodeOutputType): GraphQLOutputType {
        if (isGraphQLOutputType(type)) {
            return type;
        }

        if (type instanceof QueryNodeNonNullType) {
            return new GraphQLNonNull(this.convertToGraphQLType(type.ofType));
        }

        if (type instanceof QueryNodeListType) {
            return new GraphQLList(this.convertToGraphQLType(type.ofType));
        }

        return this.convertToGraphQLObjectType(type);
    }
}