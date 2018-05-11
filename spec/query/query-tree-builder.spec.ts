import { buildASTSchema, ObjectTypeDefinitionNode, parse } from 'graphql';
import { distillQuery } from '../../src/graphql/query-distiller';
import { createQueryTree } from '../../src/query/query-tree-builder';
import { EntitiesQueryNode, FieldQueryNode, ObjectQueryNode, TransformListQueryNode } from '../../src/query/definition';
import { setPermissionDescriptor } from '../../src/authorization/permission-descriptors-in-schema';
import { StaticPermissionDescriptor } from '../../src/authorization/permission-descriptors';
import { expect } from 'chai';

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
        expect(queryTree.properties.length).to.equal(1);
        expect(queryTree.properties[0].propertyName).to.equal('allUsers');
        expect(queryTree.properties[0].valueNode).to.be.an.instanceof(TransformListQueryNode);
        const listNode = queryTree.properties[0].valueNode as TransformListQueryNode;
        expect(listNode.listNode).to.be.an.instanceof(EntitiesQueryNode);
        const entitiesNode = listNode.listNode as EntitiesQueryNode;
        expect(entitiesNode.objectType.name).to.equal('User');
        expect(listNode.innerNode).to.be.an.instanceof(ObjectQueryNode);
        const objectNode = listNode.innerNode as ObjectQueryNode;
        expect(objectNode.properties.length).to.equal(2);
        expect(objectNode.properties[0].propertyName).to.equal('code');
        expect(objectNode.properties[0].valueNode).to.be.an.instanceof(FieldQueryNode);
        expect((objectNode.properties[0].valueNode as FieldQueryNode).field.name).to.equal('id');
        expect(objectNode.properties[1].propertyName).to.equal('name');
        expect(objectNode.properties[1].valueNode).to.be.an.instanceof(FieldQueryNode);
        expect((objectNode.properties[1].valueNode as FieldQueryNode).field.name).to.equal('name');
        console.log(queryTree.describe());
    });
});
