import { GraphQLSchema, print } from 'graphql';
import { DatabaseAdapter } from '../database/database-adapter';
import { addOperationBasedResolvers } from '../graphql/operation-based-resolvers';
import { distillOperation } from '../graphql/query-distiller';
import { createQueryTree } from './query-tree-builder';

export function addQueryResolvers(schema: GraphQLSchema, databaseAdapter: DatabaseAdapter) {
    return addOperationBasedResolvers(schema, async operationInfo => {
        console.log(print(operationInfo.operation));
        const op = distillOperation(operationInfo);
        console.log(op.describe());
        const queryTree = createQueryTree(op);
        console.log(queryTree.describe());
        const result = await databaseAdapter.execute(queryTree);
        console.log(result);
        return result;
    });
}
