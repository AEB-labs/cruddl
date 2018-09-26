import { expect } from 'chai';
import { Model, TypeKind } from '../../src/model';
import { OrderByEnumGenerator } from '../../src/schema-generation/order-by-enum-generator';

describe('OrderByEnumGenerator', () => {
    const generator = new OrderByEnumGenerator();

    it('includes scalar fields', () => {
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
});
