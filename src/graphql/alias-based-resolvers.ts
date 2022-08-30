import { GraphQLFieldResolver, GraphQLSchema } from 'graphql';
import { GraphQLNamedFieldConfig, transformSchema } from 'graphql-transformer';

export function addAliasBasedResolvers(schema: GraphQLSchema): GraphQLSchema {
    return transformSchema(schema, {
        transformField(
            config: GraphQLNamedFieldConfig<any, any>,
        ): GraphQLNamedFieldConfig<any, any> {
            if (config.resolve) {
                return config;
            }
            return {
                ...config,
                resolve: aliasBasedResolver,
            };
        },
    });
}

export const aliasBasedResolver: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
    const fieldNode = info.fieldNodes[0];
    const alias = fieldNode.alias ? fieldNode.alias.value : fieldNode.name.value;
    return source[alias];
};
