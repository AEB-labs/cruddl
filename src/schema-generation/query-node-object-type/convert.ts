import {
    GraphQLFieldConfig,
    GraphQLFieldConfigMap,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    resolveReadonlyArrayThunk,
    ThunkReadonlyArray,
} from 'graphql';
import { memorize } from 'memorize-decorator';
import { SchemaTransformationContext } from '../../schema/preparation/transformation-pipeline.js';
import {
    QueryNodeField,
    QueryNodeListType,
    QueryNodeNonNullType,
    QueryNodeObjectType,
    QueryNodeOutputType,
} from './definition.js';
import { getFieldResolver } from './field-resolver.js';
import { isGraphQLOutputType } from './utils.js';

export class QueryNodeObjectTypeConverter {
    constructor(private readonly context: SchemaTransformationContext) {}

    @memorize()
    convertToGraphQLObjectType(type: QueryNodeObjectType): GraphQLObjectType {
        return new GraphQLObjectType({
            name: type.name,
            description: type.description,
            fields: () => {
                const fields = resolveAndCheckFields(type.fields, type.name);
                return fields.reduce<GraphQLFieldConfigMap<any, any>>((result, field) => {
                    result[field.name] = {
                        description: field.description,
                        deprecationReason: field.deprecationReason,
                        args: field.args,
                        resolve: getFieldResolver(this.context, field.transformResult),
                        type: this.convertToGraphQLType(field.type),
                    } as GraphQLFieldConfig<any, any>;
                    return result;
                }, {});
            },
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
    const seenFieldNames = new Set<string>();
    const duplicateFieldNames = new Set<string>();
    for (const field of fields) {
        if (seenFieldNames.has(field.name)) {
            duplicateFieldNames.add(field.name);
            continue;
        }
        seenFieldNames.add(field.name);
    }
    if (duplicateFieldNames.size) {
        throw new Error(
            `Output type "${typeName}" has duplicate fields: ${Array.from(duplicateFieldNames).join(', ')})`,
        );
    }
    return fields;
}
