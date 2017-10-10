import { QueryNode } from '../query/definition';
import { GraphQLSchema } from 'graphql';

export interface DatabaseAdapter {
    execute(queryTree: QueryNode): Promise<any>;

    // temporary API: should be much simpler parameter
    updateSchema(schema: GraphQLSchema): Promise<void>;
}
