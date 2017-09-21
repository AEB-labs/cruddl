
import {
    GraphQLID, GraphQLInputObjectType, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString, parse, print
} from 'graphql';
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
                type: new GraphQLList(userType),
                args: {
                    filter: {
                        type: new GraphQLInputObjectType({
                            name: 'UsersFilter',
                            fields: {
                                id: {
                                    type: GraphQLID
                                },
                                name: {
                                    type: GraphQLString
                                }
                            }
                        })
                    }
                }
            }
        }
    })
});

const query = parse(`query($name: String) { allUsers(filter:{name: $name, id: "123"}) { code: id, name } }`);
console.log(print(query));
const op = distillQuery(query, schema, { name: 'Hans "Wurscht"'});
console.log(op.describe());
const queryTree = createQueryTree(op);
console.log(queryTree.describe());
const aql = getAQLForQuery(queryTree);
console.log(aql.toPrettyString());