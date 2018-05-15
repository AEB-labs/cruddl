import { Model, RootEntityType, TypeKind } from '../../../src/model';
import { expect } from 'chai';
import { IndexField } from '../../../src/model/implementation/indices';

describe('IndexField', () => {
    const model = new Model({
        types: [
            {
                name: 'Address',
                kind: TypeKind.VALUE_OBJECT,
                fields: [
                    {
                        name: 'name',
                        typeName: 'String'
                    },
                    {
                        name: 'addressLines',
                        typeName: 'String',
                        isList: true
                    }
                ]
            }, {
                name: 'Item',
                kind: TypeKind.CHILD_ENTITY,
                fields: [
                    {
                        name: 'itemNumber',
                        typeName: 'String'
                    }
                ]
            }, {
                name: 'Shipment',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'shipmentNumber',
                        typeName: 'String'
                    }
                ]
            }
        ]
    });

    const deliveryType = new RootEntityType({
        name: 'Delivery',
        kind: TypeKind.ROOT_ENTITY,
        fields: [
            {
                name: 'deliveryNumber',
                typeName: 'String'
            }, {
                name: 'consignee',
                typeName: 'Address'
            }, {
                name: 'items',
                typeName: 'Item',
                isList: true
            }, {
                name: 'shipment',
                typeName: 'Shipment',
                isRelation: true
            }
        ]
    }, model);

    describe('fields', () => {
        it('resolves direct fields', () => {
            const indexField = new IndexField('deliveryNumber', deliveryType);
            expect(indexField.field).to.equal(deliveryType.getField('deliveryNumber'));
        });

        it('resolves value object fields', () => {
            const indexField = new IndexField('consignee.name', deliveryType);
            expect(indexField.field).to.equal(model.getValueObjectTypeOrThrow('Address').getField('name'));
        });

        it('resolves child entity fields', () => {
            const indexField = new IndexField('items.itemNumber', deliveryType);
            expect(indexField.field).to.equal(model.getChildEntityTypeOrThrow('Item').getField('itemNumber'));
        });

        it('does not resolve missing fields', () => {
            const indexField = new IndexField('undefined', deliveryType);
            expect(indexField.field).to.be.undefined;
        });

        it('does not resolve non-scalar leaves', () => {
            const indexField = new IndexField('items', deliveryType);
            expect(indexField.field).to.be.undefined;
        });

        it('does traverse across root entity boundaries', () => {
            const indexField = new IndexField('shipment.shipmentNumber', deliveryType);
            expect(indexField.field).to.be.undefined;
        });
    });
});
