import {
    GraphQLID, GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString, parse
} from 'graphql';
import { distillQuery, FieldRequest } from '../../src/graphql/query-distiller';

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

    // this is a bit ugly to maintain compatibility to the old unit tests
    async function executeQuery(query: string, variableValues?: {[name: string]: any}): Promise<FieldRequest> {
        return distillQuery(parse(query), schema, variableValues).selectionSet[0].fieldRequest;
    }

    it("builds tree for simple query", async() => {
        const rootNode = await executeQuery(`{ root { currentTime } }`);
        expect(rootNode.fieldName).toBe('root');
        expect(rootNode.selectionSet.length).toBe(1);
        expect(rootNode.selectionSet[0].propertyName).toBe('currentTime');
        expect(rootNode.selectionSet[0].fieldRequest.fieldName).toBe('currentTime');
    });

    it("distinguishes field name from alias name", async() => {
        const rootNode = await executeQuery(`{ root { now: currentTime } }`);
        expect(rootNode.selectionSet[0].propertyName).toBe('now');
        const selectionNode = rootNode.selectionSet[0].fieldRequest;
        expect(selectionNode.fieldName).toBe('currentTime');
    });

    it("works for multiple requests of the same field and different aliases", async() => {
        const rootNode = await executeQuery(`{ root { now: currentTime, today: currentTime } }`);
        expect(rootNode.selectionSet.length).toBe(2);
        expect(rootNode.selectionSet[0].propertyName).toBe('now');
        expect(rootNode.selectionSet[0].fieldRequest.fieldName).toBe('currentTime');
        expect(rootNode.selectionSet[1].propertyName).toBe('today');
        expect(rootNode.selectionSet[1].fieldRequest.fieldName).toBe('currentTime');
    });

    it("builds tree for nested objects", async() => {
        const rootNode = await executeQuery(`{ root { user { id } } }`);
        expect(rootNode.selectionSet.length).toBe(1);
        expect(rootNode.selectionSet[0].propertyName).toBe('user');
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.fieldName).toBe('user');
        expect(userNode.selectionSet.length).toBe(1);
        expect(userNode.selectionSet[0].propertyName).toBe('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).toBe('id');
    });

    it("builds tree for arrays", async() => {
        const rootNode = await executeQuery(`{ root { users { id } } }`);
        expect(rootNode.selectionSet.length).toBe(1);
        expect(rootNode.selectionSet[0].propertyName).toBe('users');
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.fieldName).toBe('users');
        expect(userNode.selectionSet.length).toBe(1);
        expect(userNode.selectionSet[0].propertyName).toBe('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).toBe('id');
    });

    it("provides literally specified arguments", async() => {
        const rootNode = await executeQuery(`{ root { user(id: "123") { id } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.args['id']).toBe('123');
    });

    it("provides arguments specified in variables", async() => {
        const rootNode = await executeQuery(`query($var: ID) { root { user(id: $var) { id } } }`, {var: 123});
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.args['id']).toBe('123');
    });

    it("provides object arguments specified in variables", async() => {
        const rootNode = await executeQuery(`query($f: Filter) { root { users(filter: $f) { id } } }`, {f: { id: 123 }});
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.args['filter'].id).toBe('123');
    });

    it("supports fragments", async() => {
        const rootNode = await executeQuery(`fragment userFragment on User { id } { root { users { ...userFragment } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.selectionSet.length).toBe(1);
        expect(userNode.selectionSet[0].propertyName).toBe('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).toBe('id');
    });

    it("supports inline fragments", async() => {
        const rootNode = await executeQuery(`{ root { users { ...{ id } } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        expect(userNode.selectionSet.length).toBe(1);
        expect(userNode.selectionSet[0].propertyName).toBe('id');
        expect(userNode.selectionSet[0].fieldRequest.fieldName).toBe('id');
    });

    it("merges selections", async() => {
        const rootNode = await executeQuery(`fragment idFragment on User { id } { root { users { name, ...idFragment } } }`);
        const userNode = rootNode.selectionSet[0].fieldRequest;
        const attrNames = userNode.selectionSet.map(sel => sel.fieldRequest.fieldName);
        expect(attrNames).toContain("id");
        expect(attrNames).toContain("name");
    });

    it("supports @skip directive", async() => {
        const rootNode1 = await executeQuery(`{ root { users { id @skip(if: true) } } }`);
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).toBe(0);

        const rootNode2 = await executeQuery(`{ root { users { id @skip(if: false) } } }`);
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).toBe(1);
    });

    it("supports @skip directive with variables", async() => {
        const rootNode1 = await executeQuery(`query($var: Boolean) { root { users { id @skip(if: $var) } } }`, {var: true});
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).toBe(0);

        const rootNode2 = await executeQuery(`query($var: Boolean) { root { users { id @skip(if: $var) } } }`, {var: false});
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).toBe(1);
    });

    it("supports @include directive", async() => {
        const rootNode1 = await executeQuery(`{ root { users { id @include(if: true) } } }`);
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).toBe(1);

        const rootNode2 = await executeQuery(`{ root { users { id @include(if: false) } } }`);
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).toBe(0);
    });

    it("supports @include directive with variables", async() => {
        const rootNode1 = await executeQuery(`query($var: Boolean) { root { users { id @include(if: $var) } } }`, {var: true});
        const userNode1 = rootNode1.selectionSet[0].fieldRequest;
        expect(userNode1.selectionSet.length).toBe(1);

        const rootNode2 = await executeQuery(`query($var: Boolean) { root { users { id @include(if: $var) } } }`, {var: false});
        const userNode2 = rootNode2.selectionSet[0].fieldRequest;
        expect(userNode2.selectionSet.length).toBe(0);
    });

    it("fills out parentType", async() => {
        const rootNode = await executeQuery(`query($var: Boolean) { root { users { id } } }`, {var: true});
        expect(rootNode.parentType.name).toBe('Query');
        expect(rootNode.selectionSet[0].fieldRequest.parentType.name).toBe('Root');
    });
});