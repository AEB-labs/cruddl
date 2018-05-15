import { Model, TypeKind } from '../../../src/model';
import { expectSingleErrorToInclude, expectToBeValid, validate } from './validation-utils';
import { expect } from 'chai';
import { Severity } from '../../../src/model/validation';

describe('Model', () => {
    it('accepts simple model', () => {
        const model = new Model({
            types: [
                {
                    name: 'Delivery',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
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

        expectToBeValid(model);
    });

    it('rejects model with duplicate type names', () => {
        const model = new Model({
            types: [
                {
                    name: 'Delivery',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String'
                        }
                    ]
                }, {
                    name: 'Delivery',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String'
                        }
                    ]
                }
            ]
        });

        const result = validate(model);
        expect(result.messages.length).to.equal(2);
        for (const message of result.messages) {
            expect(message.severity).to.equal(Severity.Error);
            expect(message.message).to.equal(`Duplicate type name: "Delivery".`);
        }
    });

    it('rejects model with reserved type names', () => {
        const model = new Model({
            types: [
                {
                    name: 'Int',
                    kind: TypeKind.ROOT_ENTITY,
                    fields: [
                        {
                            name: 'deliveryNumber',
                            typeName: 'String'
                        }
                    ]
                }
            ]
        });

        expectSingleErrorToInclude(model, `Type name "Int" is reserved by a built-in type.`);
    });
});
