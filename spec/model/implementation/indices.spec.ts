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
    });
});
