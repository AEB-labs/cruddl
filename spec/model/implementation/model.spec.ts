import { expect } from 'chai';
import { Model, NamespacedPermissionProfileConfigMap, Severity, TypeKind } from '../../../src/model';
import { expectSingleErrorToInclude, expectToBeValid, validate } from './validation-utils';

describe('Model', () => {
    const permissionProfiles: ReadonlyArray<NamespacedPermissionProfileConfigMap> = [
        {
            profiles: {
                default: {
                    permissions: [
                        {
                            access: 'read',
                            roles: ['admin']
                        }
                    ]
                }
            }
        }
    ];

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
            ],
            permissionProfiles
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
            ],
            permissionProfiles
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
            ],
            permissionProfiles
        });

        expectSingleErrorToInclude(model, `Type name "Int" is reserved by a built-in type.`);
    });
});
