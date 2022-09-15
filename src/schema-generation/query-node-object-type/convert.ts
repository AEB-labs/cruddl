import {
    GraphQLFieldConfig,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    Thunk,
} from 'graphql';
import { chain, uniq, uniqBy } from 'lodash';
import memorize from 'memorize-decorator';
import {
    QueryNodeField,
    QueryNodeListType,
    QueryNodeNonNullType,
    QueryNodeObjectType,
    QueryNodeOutputType,
} from './definition';
import { fieldResolver } from './field-resolver';
import { isGraphQLOutputType, resolveThunk } from './utils';

export class QueryNodeObjectTypeConverter {
    @memorize()
    convertToGraphQLObjectType(type: QueryNodeObjectType): GraphQLObjectType {
        return new GraphQLObjectType({
            name: type.name,
            description: type.description,
            fields: () =>
                chain(resolveAndCheckFields(type.fields, type.name))
                    .keyBy((field) => field.name)
                    .mapValues(
                        (field): GraphQLFieldConfig<any, any> => ({
                            description: field.description,
                            deprecationReason: field.deprecationReason,
                            args: field.args,
                            resolve: fieldResolver,
                            type: this.convertToGraphQLType(field.type),
                        }),
                    )
                    .value(),
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

function resolveAndCheckFields(
    fieldsThunk: Thunk<ReadonlyArray<QueryNodeField>>,
    typeName: string,
): ReadonlyArray<QueryNodeField> {
    const fields = resolveThunk(fieldsThunk);
    if (uniqBy(fields, (f) => f.name).length !== fields.length) {
        throw new Error(
            `Output type "${typeName}" has duplicate fields: ${uniq(
                fields
                    .filter((f) => fields.find((f2) => f2 !== f && f2.name === f.name))
                    .map((f) => f.name),
            ).join(', ')})`,
        );
    }
    return fields;
}
