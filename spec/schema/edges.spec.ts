import gql from 'graphql-tag';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { QueryNode } from '../../src/query/definition';
import { graphql, GraphQLSchema, print, GraphQLObjectType } from 'graphql';
import { EdgeType, getEdgeType } from '../../src/schema/edges';
import { Project } from '../../src/project/project';
import { ProjectSource } from '../../src/project/source';
import { expect } from 'chai';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return { allTypeAS: [{ relB: { id: 5} }], allTypeBS: [{ relA: { id: 2 }}] };
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {

    }
}

describe('edges', () => {
    it('works with unrelated relations between two root entities', async () => {
        const schemaGQL = print(gql`
            type TypeA @rootEntity @roles(readWrite: "admin") {
                relB: TypeB @relation
            }

            type TypeB @rootEntity @roles(readWrite: "admin") {
                relA: TypeA @relation
            }
        `);

        let schema = new Project([ new ProjectSource('main.graphqls', schemaGQL)]).createSchema(new FakeDBAdatper());
        const source = gql`{ allTypeAS { relB { id } } allTypeBS { relA { id } } }`;
        const result = await graphql(schema, print(source), {}, {authRoles: [ "admin" ]}, {});
        expect(result.errors).to.equal(undefined);
    });

    it('correctly builds EdgeType from field', () => {
        const schemaGQL = print(gql`
            type Delivery @rootEntity @roles(readWrite: "admin") {
                handlingUnits: HandlingUnit @relation
            }

            type HandlingUnit @rootEntity @roles(readWrite: "admin") {
                delivery: Delivery @relation(inverseOf: "handlingUnits")
            }
        `);
        let schema = new Project([ new ProjectSource('main.graphqls', schemaGQL)]).createSchema(new FakeDBAdatper());
        const deliveryType = schema.getType('Delivery') as GraphQLObjectType;
        const handlingUnitType = schema.getType('HandlingUnit') as GraphQLObjectType;
        const handlingUnitsField = deliveryType.getFields()['handlingUnits'];
        const deliveryField = handlingUnitType.getFields()['delivery'];

        function checkEdgeType(edgeType: EdgeType) {
            expect(edgeType.fromType).to.equal(deliveryType);
            expect(edgeType.fromField).to.equal(handlingUnitsField);
            expect(edgeType.toType).to.equal(handlingUnitType);
            expect(edgeType.toField).to.equal(deliveryField);
        }

        checkEdgeType(getEdgeType(deliveryType, handlingUnitsField));
        checkEdgeType(getEdgeType(handlingUnitType, deliveryField));
    })
});
