import { GraphQLSchema, print } from 'graphql';
import { DatabaseAdapter } from '../database/database-adapter';
import { addOperationBasedResolvers } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { createQueryTree } from './query-tree-builder';
import { addAliasBasedResolvers } from '../graphql/alias-based-resolvers';

export function addQueryResolvers(schema: GraphQLSchema, databaseAdapter: DatabaseAdapter) {
    // this is needed because the query tree already does the alias handling and stores the values in the places where
    // the user expects it - GraphQL should not mess with this by using the *field* instead of the alias in the resolvers
    // do this first because addOperationBasedResolvers supports resolver chaining and this one does not (how would it)
    schema = addAliasBasedResolvers(schema);

    schema = addOperationBasedResolvers(schema, async operationInfo => {
        try {
            console.log(print(operationInfo.operation));
            const op = distillOperation(operationInfo);
            console.log(op.describe());
            const queryTree = createQueryTree(op);
            console.log(queryTree.describe());
            const result = await databaseAdapter.execute(queryTree);
            console.log(JSON.stringify(result, undefined, '  '));
            return result;
        } catch (e) {
            console.error(e.stack);
            throw e;
        }
    });

    return schema;
}
