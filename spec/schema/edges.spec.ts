import gql from 'graphql-tag';
import { DatabaseAdapter } from '../../src/database/database-adapter';
import { QueryNode } from '../../src/query/definition';
import { graphql, GraphQLObjectType, print } from 'graphql';
import { EdgeType, getEdgeType } from '../../src/schema/edges';
import { Project } from '../../src/project/project';
import { ProjectSource } from '../../src/project/source';
import { expect } from 'chai';
import { Model } from '../../src/model/implementation';
import { TypeKind } from '../../src/model/input';

class FakeDBAdatper implements DatabaseAdapter {
    async execute(queryTree: QueryNode): Promise<any> {
        return {allTypeAS: [{relB: {id: 5}}], allTypeBS: [{relA: {id: 2}}]};
    }

    async updateSchema(schema: Model): Promise<void> {

    }
}

describe('edges', () => {
    it('works with unrelated relations between two root entities', async () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.ROOT_ENTITY,
                    name: 'TypeA',
                    fields: [
                        {
                            name: 'relB',
                            typeName: 'TypeB',
                            isRelation: true
                        }
                    ]
                },
                {
                    kind: TypeKind.ROOT_ENTITY,
                    name: 'TypeB',
                    fields: [
                        {
                            name: 'relA',
                            typeName: 'TypeA',
                            isRelation: true
                        }
                    ]
                }
            ]
        });
        const fieldOnA = model.getRootEntityTypeOrThrow('TypeA').getFieldOrThrow('relB');
        const fieldOnB = model.getRootEntityTypeOrThrow('TypeB').getFieldOrThrow('relA');

        const edgeTypeFromA = getEdgeType(fieldOnA);
        expect(edgeTypeFromA.fromField).to.equal(fieldOnA);
        expect(edgeTypeFromA.toField).to.be.undefined;

        const edgeTypeFromB = getEdgeType(fieldOnB);
        expect(edgeTypeFromB.fromField).to.equal(fieldOnB);
        expect(edgeTypeFromA.toField).to.be.undefined;
    });

    it('correctly builds EdgeType from field', () => {
        const model = new Model({
            types: [
                {
                    kind: TypeKind.ROOT_ENTITY,
                    name: 'Delivery',
                    fields: [
                        {
                            name: 'handlingUnits',
                            typeName: 'HandlingUnit',
                            isRelation: true
                        }
                    ]
                },
                {
                    kind: TypeKind.ROOT_ENTITY,
                    name: 'HandlingUnit',
                    fields: [
                        {
                            name: 'delivery',
                            typeName: 'Delivery',
                            isRelation: true,
                            inverseOfFieldName: 'handlingUnits'
                        }
                    ]
                }
            ]
        });
        const deliveryType = model.getRootEntityTypeOrThrow('Delivery');
        const handlingUnitType = model.getRootEntityTypeOrThrow('HandlingUnit');
        const handlingUnitsField = deliveryType.getFieldOrThrow('handlingUnits');
        const deliveryField = handlingUnitType.getFieldOrThrow('delivery');

        function checkEdgeType(edgeType: EdgeType) {
            expect(edgeType.fromType).to.equal(deliveryType);
            expect(edgeType.fromField).to.equal(handlingUnitsField);
            expect(edgeType.toType).to.equal(handlingUnitType);
            expect(edgeType.toField).to.equal(deliveryField);
        }

        checkEdgeType(getEdgeType(handlingUnitsField));
        checkEdgeType(getEdgeType(deliveryField));
    });
});
