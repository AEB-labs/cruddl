import { SchemaTransformer } from '../transformation-pipeline';
import { addAliasBasedResolvers } from '../../../graphql/alias-based-resolvers';
import { GraphQLSchema } from 'graphql';

export class AddAliasBasedResolversTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema): GraphQLSchema {
        return addAliasBasedResolvers(schema);
    }
}
