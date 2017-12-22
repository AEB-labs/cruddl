import gql from 'graphql-tag';
import { createSchema } from '../../src/schema/schema-builder';
import { addQueryResolvers } from '../../src/query/query-resolvers';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { QueryNode } from '../../src/query/definition';
import { graphql, GraphQLSchema, Source, print, GraphQLObjectType } from 'graphql';
import { EdgeType, getEdgeType } from '../../src/schema/edges';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return { allTypeAS: [{ relB: { id: 5} }], allTypeBS: [{ relA: { id: 2 }}] };
    }

    async updateSchema(schema: GraphQLSchema): Promise<void> {

    }
}

describe('edges', () => {
    it('works with unrelated relations between two root entities', async () => {
        const schemaGQL = gql`
            type TypeA @rootEntity @roles(readWrite: "admin") {
                relB: TypeB @relation
            }

            type TypeB @rootEntity @roles(readWrite: "admin") {
                relA: TypeA @relation
            }
        `;

        let schema = createSchema({schemaParts:[{source: schemaGQL}]});
        schema = addQueryResolvers(schema, new FakeDBAdatper());
        const source = gql`{ allTypeAS { relB { id } } allTypeBS { relA { id } } }`;
        const result = await graphql(schema, new Source(print(source)), {}, {authRoles: [ "admin" ]}, {});
        expect(result.errors).toEqual(undefined);
    });

    it('correctly builds EdgeType from field', () => {
        const schemaGQL = gql`
            type Delivery @rootEntity @roles(readWrite: "admin") {
                handlingUnits: HandlingUnit @relation
            }

            type HandlingUnit @rootEntity @roles(readWrite: "admin") {
                delivery: Delivery @relation(inverseOf: "handlingUnits")
            }
        `;
        let schema = createSchema({schemaParts:[{source: schemaGQL}]});
        const deliveryType = schema.getType('Delivery') as GraphQLObjectType;
        const handlingUnitType = schema.getType('HandlingUnit') as GraphQLObjectType;
        const handlingUnitsField = deliveryType.getFields()['handlingUnits'];
        const deliveryField = handlingUnitType.getFields()['delivery'];

        function checkEdgeType(edgeType: EdgeType) {
            expect(edgeType.fromType).toBe(deliveryType);
            expect(edgeType.fromField).toBe(handlingUnitsField);
            expect(edgeType.toType).toBe(handlingUnitType);
            expect(edgeType.toField).toBe(deliveryField);
        }

        checkEdgeType(getEdgeType(deliveryType, handlingUnitsField));
        checkEdgeType(getEdgeType(handlingUnitType, deliveryField));
    })
});