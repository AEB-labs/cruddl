import {
    GraphQLFieldConfig,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLUnionType,
    Thunk
} from 'graphql';
import { chain, uniqBy } from 'lodash';
import memorize from 'memorize-decorator';
import { aliasBasedResolver } from '../../graphql/alias-based-resolvers';
import {
    QueryNodeField,
    QueryNodeListType,
    QueryNodeNonNullType,
    QueryNodeObjectType,
    QueryNodeOutputType,
    QueryNodeUnionType
} from './definition';
import { isGraphQLOutputType, resolveThunk } from './utils';

export class QueryNodeObjectTypeConverter {
    @memorize()
    convertToGraphQLObjectType(type: QueryNodeObjectType): GraphQLObjectType {
        return new GraphQLObjectType({
            name: type.name,
            description: type.description,
            fields: () => chain(resolveAndCheckFields(type.fields, type.name))
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

        if (type instanceof QueryNodeUnionType) {
            return new GraphQLUnionType({
                types: type.types.map(value => <GraphQLObjectType>this.convertToGraphQLType(value)),
                name: type.name
            });
        }

        return this.convertToGraphQLObjectType(type);
    }
}

function resolveAndCheckFields(fieldsThunk: Thunk<ReadonlyArray<QueryNodeField>>, typeName: string): ReadonlyArray<QueryNodeField> {
    const fields = resolveThunk(fieldsThunk);
    if (uniqBy(fields, f => f.name).length !== fields.length) {
        throw new Error(`Output type "${typeName}" has duplicate fields (fields: ${fields.map(f => f.name).join(', ')})`);
    }
    return fields;
}
