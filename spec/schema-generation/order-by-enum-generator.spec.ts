import { expect } from 'chai';
import { Model, TypeKind } from '../../src/model';
import { OrderByEnumGenerator } from '../../src/schema-generation/order-by-enum-generator';

describe('OrderByEnumGenerator', () => {
    it('includes scalar fields', () => {
        const generator = new OrderByEnumGenerator();
        const model = new Model({
            types: [
                {
                    name: 'Test',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'field',
                            typeName: 'String'
                        }
                    ]
                }
            ]
        });
        const enumType = generator.generate(model.getObjectTypeOrThrow('Test'));
        expect(enumType.values.map(v => v.name)).to.deep.equal([
            'id_ASC',
            'id_DESC',
            'createdAt_ASC',
            'createdAt_DESC',
            'updatedAt_ASC',
            'updatedAt_DESC',
            'field_ASC',
            'field_DESC'
        ]);
    });

    it('does not include list fields', () => {
        const generator = new OrderByEnumGenerator();
        const model = new Model({
            types: [
                {
                    name: 'Test',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'list',
                            typeName: 'String',
                            isList: true
                        }
                    ]
                }
            ]
        });
        const enumType = generator.generate(model.getObjectTypeOrThrow('Test'));
        expect(enumType.values.map(v => v.name)).to.deep.equal([
            'id_ASC',
            'id_DESC',
            'createdAt_ASC',
            'createdAt_DESC',
            'updatedAt_ASC',
            'updatedAt_DESC'
        ]);
    });

    const shipmentDeliveryModel = new Model({
        types: [
            {
                name: 'Delivery',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'dangerousGoodsInfo',
                        typeName: 'DangerousGoodsInfo'
                    },
                    {
                        name: 'shipment',
                        typeName: 'Shipment',
                        isRelation: true
                    }
                ]
            },
            {
                name: 'DangerousGoodsInfo',
                kind: TypeKind.ENTITY_EXTENSION,
                fields: [
                    {
                        name: 'isDangerousGoods',
                        typeName: 'Boolean'
                    }
                ]
            },
            {
                name: 'Shipment',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'delivery',
                        typeName: 'Delivery',
                        isRelation: true,
                        inverseOfFieldName: 'shipment'
                    }
                ]
            }
        ]
    });

    const deliveryType = shipmentDeliveryModel.getObjectTypeOrThrow('Delivery');

    it('includes root entity traversal fields', () => {
        const generator = new OrderByEnumGenerator();
        const enumType = generator.generate(deliveryType);
        expect(enumType.values.map(v => v.name)).to.deep.equal([
            'id_ASC',
            'id_DESC',
            'createdAt_ASC',
            'createdAt_DESC',
            'updatedAt_ASC',
            'updatedAt_DESC',
            'dangerousGoodsInfo_isDangerousGoods_ASC',
            'dangerousGoodsInfo_isDangerousGoods_DESC',
            'shipment_id_ASC',
            'shipment_id_DESC',
            'shipment_createdAt_ASC',
            'shipment_createdAt_DESC',
            'shipment_updatedAt_ASC',
            'shipment_updatedAt_DESC',
            'shipment_delivery_id_ASC',
            'shipment_delivery_id_DESC',
            'shipment_delivery_createdAt_ASC',
            'shipment_delivery_createdAt_DESC',
            'shipment_delivery_updatedAt_ASC',
            'shipment_delivery_updatedAt_DESC',
            'shipment_delivery_dangerousGoodsInfo_isDangerousGoods_ASC',
            'shipment_delivery_dangerousGoodsInfo_isDangerousGoods_DESC'
        ]);
    });

    it('cuts off root entity traversal fields if specified', () => {
        const generator = new OrderByEnumGenerator({ maxRootEntityDepth: 1 });
        const enumType = generator.generate(deliveryType);
        expect(enumType.values.map(v => v.name)).to.deep.equal([
            'id_ASC',
            'id_DESC',
            'createdAt_ASC',
            'createdAt_DESC',
            'updatedAt_ASC',
            'updatedAt_DESC',
            'dangerousGoodsInfo_isDangerousGoods_ASC',
            'dangerousGoodsInfo_isDangerousGoods_DESC',
            'shipment_id_ASC',
            'shipment_id_DESC',
            'shipment_createdAt_ASC',
            'shipment_createdAt_DESC',
            'shipment_updatedAt_ASC',
            'shipment_updatedAt_DESC',
        ]);
    });

    it('does not generate root entity traversal fields if specified as 0', () => {
        const generator = new OrderByEnumGenerator({ maxRootEntityDepth: 0 });
        const enumType = generator.generate(deliveryType);
        expect(enumType.values.map(v => v.name)).to.deep.equal([
            'id_ASC',
            'id_DESC',
            'createdAt_ASC',
            'createdAt_DESC',
            'updatedAt_ASC',
            'updatedAt_DESC',
            'dangerousGoodsInfo_isDangerousGoods_ASC',
            'dangerousGoodsInfo_isDangerousGoods_DESC'
        ]);
    });
});
