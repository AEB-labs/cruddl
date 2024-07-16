import {
    GraphQLFieldConfig,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    resolveReadonlyArrayThunk,
} from 'graphql';
import { ThunkReadonlyArray } from 'graphql/type/definition';
import { chain, uniq, uniqBy } from 'lodash';
import memorize from 'memorize-decorator';
import { SchemaTransformationContext } from '../../schema/preparation/transformation-pipeline';
import {
    QueryNodeField,
    QueryNodeListType,
    QueryNodeNonNullType,
    QueryNodeObjectType,
    QueryNodeOutputType,
} from './definition';
import { getFieldResolver } from './field-resolver';
import { isGraphQLOutputType } from './utils';

export class QueryNodeObjectTypeConverter {
    constructor(private readonly context: SchemaTransformationContext) {}

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
                            resolve: getFieldResolver(this.context, field.transformResult),
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
    fieldsThunk: ThunkReadonlyArray<QueryNodeField>,
    typeName: string,
): ReadonlyArray<QueryNodeField> {
    const fields = resolveReadonlyArrayThunk(fieldsThunk);
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
