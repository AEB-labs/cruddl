import { buildASTSchema, parse } from 'graphql';
import { distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import {
    EntitiesQueryNode, FieldQueryNode, ObjectQueryNode, RootEntityIDQueryNode, TransformListQueryNode
} from '../../src/query-tree';
import { expect } from 'chai';
import { createModel, Model } from '../../src/model';
import { SchemaConfig } from '../../src/config/schema-config';

describe('query-tree-builder', () => {
    const ast = parse(`
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
    `);
    const schema = buildASTSchema(ast);

    it('builds a simple entity fetch tree', () => {
        async function test() {
            await Promise.resolve(123);
        }
        test();
        const query = `{ allUsers { code: id, name } }`;
        const op = distillQuery(parse(query), schema);
        const queryTree = createQueryTree(op, createModel({ schemaParts: [ { document: ast } ] }));
        expect(queryTree.properties.length).to.equal(1);
        expect(queryTree.properties[0].propertyName).to.equal('allUsers');
        expect(queryTree.properties[0].valueNode).to.be.an.instanceof(TransformListQueryNode);
        const listNode = queryTree.properties[0].valueNode as TransformListQueryNode;
        expect(listNode.listNode).to.be.an.instanceof(EntitiesQueryNode);
        const entitiesNode = listNode.listNode as EntitiesQueryNode;
        expect(entitiesNode.rootEntityType.name).to.equal('User');
        expect(listNode.innerNode).to.be.an.instanceof(ObjectQueryNode);
        const objectNode = listNode.innerNode as ObjectQueryNode;
        expect(objectNode.properties.length).to.equal(2);
        expect(objectNode.properties[0].propertyName).to.equal('code');
        expect(objectNode.properties[0].valueNode).to.be.an.instanceof(RootEntityIDQueryNode);
        expect(objectNode.properties[1].propertyName).to.equal('name');
        expect(objectNode.properties[1].valueNode).to.be.an.instanceof(FieldQueryNode);
        expect((objectNode.properties[1].valueNode as FieldQueryNode).field.name).to.equal('name');
        console.log(queryTree.describe());
    });
});
