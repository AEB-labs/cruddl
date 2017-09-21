
import { GraphQLID, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString, parse, print } from 'graphql';
import { createQueryTree } from './src/query/query-tree-builder';
import { distillQuery } from './src/graphql/query-distiller';
import { getAQLForQuery } from './src/database/arangodb/aql-generator';

const userType = new GraphQLObjectType({
    name: 'User',
    fields: {
        id: {
            type: GraphQLID
        },
        name: {
            type: GraphQLString
        }
    }
});

const schema = new GraphQLSchema({
    // Note: not using createCollectiveRootType() here because this test should only test buildFieldRequest.
    query: new GraphQLObjectType({
        name: 'Query',
        fields: {
            allUsers: {
                type: new GraphQLList(userType)
            }
        }
    })
});

const query = parse(`{ allUsers { code: id, name } }`);
console.log(print(query));
const op = distillQuery(query, schema);
console.log(op.describe());
const queryTree = createQueryTree(op);
console.log(queryTree.describe());
const aql = getAQLForQuery(queryTree);
console.log(aql.normalize().bindValues);
console.log(aql.toPrettyString());