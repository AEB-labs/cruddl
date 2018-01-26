import { SchemaTransformer } from '../transformation-pipeline';
import { GraphQLSchema } from 'graphql';
import { addRuntimeErrorResolvers } from '../../../query/runtime-errors';

export class AddRuntimeErrorResolversTransformer implements SchemaTransformer {
    transform(schema: GraphQLSchema): GraphQLSchema {
        return addRuntimeErrorResolvers(schema);
    }
}
