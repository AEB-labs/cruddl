import {
    buildASTSchema, GraphQLID, GraphQLList, GraphQLObjectType, GraphQLSchema, GraphQLString, parse
} from 'graphql';
import { distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import any = jasmine.any;
import { EntitiesQueryNode, FieldQueryNode, TransformListQueryNode, ObjectQueryNode } from '../../src/query/definition';
import objectContaining = jasmine.objectContaining;

describe('query-tree-builder', () => {
    const schema = buildASTSchema(parse(`
    schema {
      query: Query
    }
    type Query {
      allUsers: [User]
    }
    type User {
      id: ID
      name: String
    }
    `));

    it('builds a simple entity fetch tree', () => {
        const query = `{ allUsers { code: id, name } }`;
        const op = distillQuery(parse(query), schema);
        const queryTree = createQueryTree(op);
        expect(queryTree.properties.length).toBe(1);
        expect(queryTree.properties[0].propertyName).toBe('allUsers');
        expect(queryTree.properties[0].valueNode).toEqual(any(TransformListQueryNode));
        const listNode = queryTree.properties[0].valueNode as TransformListQueryNode;
        expect(listNode.listNode).toEqual(any(EntitiesQueryNode));
        const entitiesNode = listNode.listNode as EntitiesQueryNode;
        expect(entitiesNode.objectType.name).toBe('User');
        expect(listNode.innerNode).toEqual(any(ObjectQueryNode));
        const objectNode = listNode.innerNode as ObjectQueryNode;
        expect(objectNode.properties.length).toBe(2);
        expect(objectNode.properties[0].propertyName).toBe('code');
        expect(objectNode.properties[0].valueNode).toEqual(any(FieldQueryNode));
        expect((objectNode.properties[0].valueNode as FieldQueryNode).field.name).toBe('id');
        expect(objectNode.properties[1].propertyName).toBe('name');
        expect(objectNode.properties[1].valueNode).toEqual(any(FieldQueryNode));
        expect((objectNode.properties[1].valueNode as FieldQueryNode).field.name).toBe('name');
        console.log(queryTree.describe());
    });
});
