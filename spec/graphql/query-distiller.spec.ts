import {
    buildASTSchema, graphql, GraphQLBoolean,
    GraphQLID, GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLObjectType, GraphQLResolveInfo, GraphQLSchema,
    GraphQLString, parse
} from 'graphql';
import { DistilledOperation, distillQuery, FieldRequest } from '../../src/graphql/query-distiller';
import gql from 'graphql-tag';
import { expect } from 'chai';

describe("query-distiller", () => {
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
                root: {
                    type: new GraphQLObjectType({
                        name: 'Root',
                        fields: {
                            currentTime: {
                                type: GraphQLString
                            },
                            user: {
                                type: userType,
                                args: {
                                    id: {
                                        type: GraphQLID
                                    }
                                }
                            },
                            users: {
                                type: new GraphQLList(userType),
                                args: {
                                    first: {
                                        type: GraphQLInt
                                    },
                                    filter: {
                                        type: new GraphQLInputObjectType({
                                            name: 'Filter',
                                            fields: {
                                                id: {
                                                    type: GraphQLID
                                                }
                                            }
                                        })
                                    }
                                }
                            }
                        }
                    })
                }
            }
        })
    });

    function executeQuery(query: string, variableValues?: {[name: string]: any}): DistilledOperation {
        return distillQuery(parse(query), schema, variableValues);
    }

    // this is a bit ugly to maintain compatibility to the old unit tests
    async function executeQueryWithRootField(query: string, variableValues?: {[name: string]: any}): Promise<FieldRequest> {
        return executeQuery(query, variableValues).selectionSet[0].fieldRequest;
    }

    it('assumes correctly that GraphQLResolveInfo.variableValues is already coeerced', async () =>{
        // this is important because the query distiller does not do coercion
        let info: GraphQLResolveInfo|undefined = undefined;
        const schema = buildASTSchema(gql(`type Query { field(str: String, int: Int): Int } `));
        const result = await graphql({
            schema,
            source: 'query q($str: String, $int: Int) { field(str: $str, int: $int) }',
            fieldResolver: (a, b, c, i) => { info = i; return 42; },
            variableValues: { str: 123, int: '123' } // the wrong way around intentionally to test coercion
        });
        expect(result.errors).to.be.undefined;
        expect(result.data!.field).to.equal(42);
        expect(info!.variableValues.str).to.equal('123');
        expect(info!.variableValues.int).to.equal(123);
        expect(typeof info!.variableValues.str).to.equal('string');
        expect(typeof info!.variableValues.int).to.equal('number');
    });

    it("builds tree for simple query", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { currentTime } }`);
        expect(rootNode.fieldName).to.equal('root');
        expect(rootNode.selectionSet.length).to.equal(1);
        expect(rootNode.selectionSet[0].propertyName).to.equal('currentTime');
        expect(rootNode.selectionSet[0].fieldRequest.fieldName).to.equal('currentTime');
    });

    it("distinguishes field name from alias name", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { now: currentTime } }`);
        expect(rootNode.selectionSet[0].propertyName).to.equal('now');
        const selectionNode = rootNode.selectionSet[0].fieldRequest;
        expect(selectionNode.fieldName).to.equal('currentTime');
    });

    it("works for multiple requests of the same field and different aliases", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { now: currentTime, today: currentTime } }`);
        expect(rootNode.selectionSet.length).to.equal(2);
        expect(rootNode.selectionSet[0].propertyName).to.equal('now');
        expect(rootNode.selectionSet[0].fieldRequest.fieldName).to.equal('currentTime');
        expect(rootNode.selectionSet[1].propertyName).to.equal('today');
        expect(rootNode.selectionSet[1].fieldRequest.fieldName).to.equal('currentTime');
    });

    it("builds tree for nested objects", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { user { id } } }`);
        expect(rootNode.selectionSet.length).to.equal(1);
        expect(rootNode.selectionSet[0].propertyName).to.equal('user');
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.fieldName).to.equal('user');
        expect(userNode.selectionSet.length).to.equal(1);
        expect(userNode.selectionSet[0].propertyName).to.equal('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).to.equal('id');
    });

    it("builds tree for arrays", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { users { id } } }`);
        expect(rootNode.selectionSet.length).to.equal(1);
        expect(rootNode.selectionSet[0].propertyName).to.equal('users');
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.fieldName).to.equal('users');
        expect(userNode.selectionSet.length).to.equal(1);
        expect(userNode.selectionSet[0].propertyName).to.equal('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).to.equal('id');
    });

    it("provides literally specified arguments", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { user(id: "123") { id } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.args['id']).to.equal('123');
    });

    it("provides arguments specified in variables", async() => {
        const rootNode = await executeQueryWithRootField(`query($var: ID) { root { user(id: $var) { id } } }`, {var: 123});
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.args['id']).to.equal(123);
    });

    it("provides object arguments specified in variables", async() => {
        const rootNode = await executeQueryWithRootField(`query($f: Filter) { root { users(filter: $f) { id } } }`, {f: { id: 123 }});
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.args['filter'].id).to.equal(123);
    });

    it("supports fragments", async() => {
        const rootNode = await executeQueryWithRootField(`fragment userFragment on User { id } { root { users { ...userFragment } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.selectionSet.length).to.equal(1);
        expect(userNode.selectionSet[0].propertyName).to.equal('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).to.equal('id');
    });

    it("supports inline fragments", async() => {
        const rootNode = await executeQueryWithRootField(`{ root { users { ...{ id } } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.selectionSet.length).to.equal(1);
        expect(userNode.selectionSet[0].propertyName).to.equal('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).to.equal('id');
    });

    it("merges selections", async() => {
        const rootNode = await executeQueryWithRootField(`fragment idFragment on User { id } { root { users { name, ...idFragment } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        const attrNames = userNode.selectionSet.map(sel => sel.fieldRequest.fieldName);
        expect(attrNames).to.contain("id");
        expect(attrNames).to.contain("name");
    });

    it("supports @skip directive", async() => {
        const rootNode1 = await executeQueryWithRootField(`{ root { users { id @skip(if: true) } } }`);
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).to.equal(0);

        const rootNode2 = await executeQueryWithRootField(`{ root { users { id @skip(if: false) } } }`);
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).to.equal(1);
    });

    it("supports @skip directive with variables", async() => {
        const rootNode1 = await executeQueryWithRootField(`query($var: Boolean) { root { users { id @skip(if: $var) } } }`, {var: true});
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).to.equal(0);

        const rootNode2 = await executeQueryWithRootField(`query($var: Boolean) { root { users { id @skip(if: $var) } } }`, {var: false});
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).to.equal(1);
    });

    it("supports @include directive", async() => {
        const rootNode1 = await executeQueryWithRootField(`{ root { users { id @include(if: true) } } }`);
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).to.equal(1);

        const rootNode2 = await executeQueryWithRootField(`{ root { users { id @include(if: false) } } }`);
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).to.equal(0);
    });

    it("supports @include directive with variables", async() => {
        const rootNode1 = await executeQueryWithRootField(`query($var: Boolean) { root { users { id @include(if: $var) } } }`, {var: true});
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).to.equal(1);

        const rootNode2 = await executeQueryWithRootField(`query($var: Boolean) { root { users { id @include(if: $var) } } }`, {var: false});
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).to.equal(0);
    });

    it("fills out parentType", async() => {
        const rootNode = await executeQueryWithRootField(`query($var: Boolean) { root { users { id } } }`, {var: true});
        expect(rootNode.parentType.name).to.equal('Query');
        expect(rootNode.selectionSet[0].fieldRequest.parentType.name).to.equal('Root');
    });

    it("excludes __typename fields", async() => {
        // __typename requests are always handled by GraphQL. You can't define custom resolvers on them, so it does not
        // make sense to include them in the result object - thus, users should not care whether the request included
        // this field or not
        const rootNode = await executeQuery(`{ root { __typename, dontBeFooled: __typename }, __typename }`);
        expect(rootNode.selectionSet.length).to.equal(1);
        expect(rootNode.selectionSet[0].fieldRequest.fieldName).to.equal('root');
        expect(rootNode.selectionSet[0].fieldRequest.selectionSet.length).to.equal(0);
    });

    it("excludes __schema and __type fields", async() => {
        // These fields are handled by the GraphQL engine
        const rootNode = await executeQuery(`{ __schema { types { name } } __type(name: "Test") { name } }`);
        expect(rootNode.selectionSet.length).to.equal(0);
    });
});