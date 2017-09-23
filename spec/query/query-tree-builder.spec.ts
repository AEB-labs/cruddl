import { GraphQLID, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString, parse } from 'graphql';
import { distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import any = jasmine.any;
import { EntitiesQueryNode, FieldQueryNode, ListQueryNode, ObjectQueryNode } from '../../src/query/definition';
import objectContaining = jasmine.objectContaining;

describe('query-tree-builder', () => {
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

    it('builds a simple entity fetch tree', () => {
        const query = `{ allUsers { code: id, name } }`;
        const op = distillQuery(parse(query), schema);
        const queryTree = createQueryTree(op);
        expect(queryTree.properties.length).toBe(1);
        expect(queryTree.properties[0].propertyName).toBe('allUsers');
        expect(queryTree.properties[0].valueNode).toEqual(any(ListQueryNode));
        const listNode = queryTree.properties[0].valueNode as ListQueryNode;
        expect(listNode.listNode).toEqual(any(EntitiesQueryNode));
        const entitiesNode = listNode.listNode as EntitiesQueryNode;
        expect(entitiesNode.objectType).toBe(userType);
        expect(listNode.innerNode).toEqual(any(ObjectQueryNode));
        const objectNode = listNode.innerNode as ObjectQueryNode;
        expect(objectNode.properties.length).toBe(2);
        expect(objectNode.properties[0].propertyName).toBe('code');
        expect(objectNode.properties[0].valueNode).toEqual(any(FieldQueryNode));
        expect((objectNode.properties[0].valueNode as FieldQueryNode).field).toBe(userType.getFields()['id']);
        expect(objectNode.properties[1].propertyName).toBe('name');
        expect(objectNode.properties[1].valueNode).toEqual(any(FieldQueryNode));
        expect((objectNode.properties[1].valueNode as FieldQueryNode).field).toBe(userType.getFields()['name']);
        console.log(queryTree.describe());
    });
});
