import { CalcMutationsOperator, Field, Model, TypeKind } from '../../../src/model/index';
import { expect } from 'chai';
import { Severity } from '../../../src/model/validation';
import { expectSingleErrorToInclude, expectToBeValid, validate } from './validation-utils';

describe('Field', () => {
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
                name: 'Country',
                kind: TypeKind.ROOT_ENTITY,
                keyFieldName: 'isoCode',
                fields: [
                    {
                        name: 'isoCode',
                        typeName: 'String'
                    }
                ]
            }, {
                name: 'Shipment',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'deliveries',
                        typeName: 'Delivery',
                        isList: true,
                        isRelation: true
                    }, {
                        name: 'delivery',
                        typeName: 'Delivery',
                        isRelation: true
                    }, {
                        name: 'deliveryNonRelation',
                        typeName: 'Delivery'
                    }, {
                        name: 'deliveryWithInverseOf',
                        typeName: 'Delivery',
                        isRelation: true,
                        inverseOfFieldName: 'shipment'
                    }, {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isRelation: true,
                        isList: true
                    }
                ]
            }, {
                name: 'Delivery',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'shipment',
                        typeName: 'Shipment',
                        isRelation: true
                    }
                ]
            }, {
                name: 'HandlingUnit',
                kind: TypeKind.ROOT_ENTITY,
                fields: []
            }, {
                name: 'Item',
                kind: TypeKind.CHILD_ENTITY,
                fields: []
            }, {
                name: 'DangerousGoodsInfo',
                kind: TypeKind.ENTITY_EXTENSION,
                fields: []
            }
        ],
        permissionProfiles: {
            accounting: {
                permissions: [
                    {
                        roles: ['accounting'],
                        access: 'readWrite'
                    }
                ]
            }
        }
    });
    const shipmentType = model.getRootEntityTypeOrThrow('Shipment');
    const deliveryType = model.getRootEntityTypeOrThrow('Delivery');
    const handlingUnitType = model.getRootEntityTypeOrThrow('HandlingUnit');
    const addressType = model.getValueObjectTypeOrThrow('Address');
    const itemType = model.getChildEntityTypeOrThrow('Item');
    const dangerousGoodsInfoType = model.getEntityExtensionTypeOrThrow('DangerousGoodsInfo');

    describe('with type', () => {
        it('accepts built-in type', () => {
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'String'
            }, deliveryType);

            expectToBeValid(field);
        });

        it('accepts user-defined types', () => {
            const field = new Field({
                name: 'address',
                typeName: 'Address'
            }, deliveryType);

            expectToBeValid(field);
            expect(field.type).to.equal(model.getType('Address'));
            expect(field.hasValidType).to.be.true;
        });

        it('reports undefined type', () => {
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'UndefinedType'
            }, deliveryType);

            expectSingleErrorToInclude(field, 'UndefinedType');
        });

        it('falls back to pseudo type if typeName is not found', () => {
            // this is important so that the model does not break if it is invalid
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'Undefined'
            }, deliveryType);
            expect(field.type).not.to.be.undefined;
            expect(field.type.name).to.equal('Undefined');
            expect(field.hasValidType).to.be.false;
        });
    });

    describe('with root entity type', () => {
        it('rejects fields with root entity type without @relation or @reference', () => {
            const field = new Field({
                name: 'country',
                typeName: 'Country'
            }, deliveryType);

            expectSingleErrorToInclude(field, 'root entity');
        });

        it('rejects fields with both @relation and @reference', () => {
            const field = new Field({
                name: 'country',
                typeName: 'Country',
                isRelation: true,
                isReference: true
            }, deliveryType);

            expectSingleErrorToInclude(field, '@reference and @relation can not be combined');
        });
    });

    describe('with relations', () => {
        it('rejects @relation on non-root-entity-type as declaring type', () => {
            const field = new Field({
                name: 'handlingUnit',
                typeName: 'HandlingUnit',
                isRelation: true
            }, addressType);
            expectSingleErrorToInclude(field, 'Relations can only be defined on root entity types. Consider using @reference instead');
        });

        it('rejects @relation to non-root-entity type', () => {
            const field = new Field({
                name: 'address',
                typeName: 'Address',
                isRelation: true
            }, deliveryType);

            expectSingleErrorToInclude(field, 'Type "Address" can not be used with @relation because it is not a root entity type');
        });

        describe('without inverseOf', () => {
            it('accepts', () => {
                const field = deliveryType.getFieldOrThrow('shipment'); // need a field woven into the model here
                expectToBeValid(field);
            });

            it('provides the other field as inverseField', () => {
                const field = deliveryType.getFieldOrThrow('shipment'); // need a field woven into the model here
                expect(field.inverseField).to.equal(shipmentType.getFieldOrThrow('deliveryWithInverseOf'));
            });

            it('resolves inverseField to undefined if there is none', () => {
                const field = shipmentType.getFieldOrThrow('handlingUnits');
                expect(field.inverseField).to.be.undefined;
            });

            it('rejects if there are multiple inverse fields', () => {
                const m = new Model({
                    types: [
                        {
                            name: 'Delivery',
                            kind: TypeKind.ROOT_ENTITY,
                            fields: [
                                {
                                    name: 'packager',
                                    typeName: 'Person',
                                    isRelation: true,
                                    inverseOfFieldName: 'delivery'
                                }, {
                                    name: 'shipper',
                                    typeName: 'Person',
                                    isRelation: true,
                                    inverseOfFieldName: 'delivery'
                                }
                            ]
                        }, {
                            name: 'Person',
                            kind: TypeKind.ROOT_ENTITY,
                            fields: [
                                {
                                    name: 'delivery',
                                    typeName: 'Delivery',
                                    isRelation: true
                                }
                            ]
                        }
                    ]
                });

                const field = m.getRootEntityTypeOrThrow('Person').getFieldOrThrow('delivery');
                const result = validate(field);
                expect(result.messages.length).to.equal(2);
                for (const message of result.messages) {
                    expect(message.severity).to.equal(Severity.Error);
                    expect(message.message).to.equal('Multiple fields ("Delivery.packager", "Delivery.shipper") declare inverseOf to "Person.delivery".');
                }
            });

            describe('warns if there is an unrelated inverse relation', () => {
                const field = shipmentType.getFieldOrThrow('delivery');
                const result = validate(field);
                expect(result.messages.length).to.equal(1);
                expect(result.messages[0].severity).to.equal(Severity.Warning);
                expect(result.messages[0].message).to.equal('This field and "Delivery.shipment" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation.');
            });
        });

        describe('with inverseOf', () => {
            describe('that is not a list', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'delivery'
                }, deliveryType);

                it('accepts', () => {
                    expectToBeValid(field);
                });

                it('provides the field in inverseOf', () => {
                    expect(field.inverseOf).to.equal(shipmentType.getField('delivery'));
                });
            });

            describe('that is a list', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'deliveries'
                }, deliveryType);

                it('accepts', () => {
                    expectToBeValid(field);
                });

                it('provides the field in inverseOf', () => {
                    expect(field.inverseOf).to.equal(shipmentType.getField('deliveries'));
                });
            });

            it('rejects inverseOf to undefined field', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'undefinedField'
                }, deliveryType);

                expectSingleErrorToInclude(field, 'Field "undefinedField" does not exist on type "Shipment"');
            });

            it('rejects inverseOf to non-relation field', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'deliveryNonRelation'
                }, deliveryType);

                expectSingleErrorToInclude(field, 'Field "Shipment.deliveryNonRelation" used as inverse field of "Delivery.shipment" does not have the @relation directive');
            });

            it('rejects inverseOf to field that has inverseOf set', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'deliveryWithInverseOf'
                }, deliveryType);

                expectSingleErrorToInclude(field, 'Field "Shipment.deliveryWithInverseOf" used as inverse field of "Delivery.shipment" should not declare inverseOf itself');
            });

            it('rejects inverseOf to field with different type than the field\'s declaring type', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'handlingUnits'
                }, deliveryType);

                expectSingleErrorToInclude(field, 'Field "Shipment.handlingUnits" used as inverse field of "Delivery.shipment" has named type "HandlingUnit" but should be of type "Delivery"');
            });

            it('does not set inverseField', () => {
                const field = new Field({
                    name: 'shipment',
                    typeName: 'Shipment',
                    isRelation: true,
                    inverseOfFieldName: 'delivery'
                }, deliveryType);

                expect(field.inverseField).to.be.undefined;
            });
        });
    });

    describe('with references', () => {
        it('accepts @reference to root entity type', () => {
            const field = new Field({
                name: 'country',
                typeName: 'Country',
                isReference: true
            }, deliveryType);

            expectToBeValid(field);
        });

        it('rejects @reference to root entity type without @key field', () => {
            const field = new Field({
                name: 'handlingUnit',
                typeName: 'HandlingUnit',
                isReference: true
            }, deliveryType);

            expectSingleErrorToInclude(field, `"HandlingUnit" can not be used as @reference type because is does not have a field annotated with @key`);
        });

        it('rejects @reference to value object type', () => {
            const field = new Field({
                name: 'address',
                typeName: 'Address',
                isReference: true
            }, deliveryType);

            expectSingleErrorToInclude(field, `"Address" can not be used as @reference type because is not a root entity type.`);
        });

        it('rejects @reference on list field', () => {
            const field = new Field({
                name: 'countries',
                typeName: 'Country',
                isReference: true,
                isList: true
            }, deliveryType);

            expectSingleErrorToInclude(field, `@reference is not supported with list types. Consider wrapping the reference in a child entity or value object type.`);
        });
    });

    describe('with entity extension type', () => {
        it('accepts entity extensions embedded in root entities', () => {
            const field = new Field({
                name: 'items',
                typeName: 'DangerousGoodsInfo'
            }, deliveryType);

            expectToBeValid(field);
        });

        it('accepts entity extensions embedded in child entities', () => {
            const field = new Field({
                name: 'items',
                typeName: 'DangerousGoodsInfo'
            }, itemType);

            expectToBeValid(field);
        });

        it('accepts entity extensions embedded in entity extensions', () => {
            const field = new Field({
                name: 'items',
                typeName: 'DangerousGoodsInfo'
            }, dangerousGoodsInfoType);

            expectToBeValid(field);
        });

        it('rejects entity extensions embedded in value objects', () => {
            const field = new Field({
                name: 'items',
                typeName: 'DangerousGoodsInfo'
            }, addressType);

            expectSingleErrorToInclude(field, `Type "DangerousGoodsInfo" is an entity extension and can not be used within value object types. Change "Address" to an entity extension type or use a value object type for "items".`);
        });

        it('rejects entity extension types on list fields', () => {
            const field = new Field({
                name: 'items',
                typeName: 'DangerousGoodsInfo',
                isList: true
            }, deliveryType);

            expectSingleErrorToInclude(field, `Type "DangerousGoodsInfo" can not be used in a list because it is an entity extension type. Use a child entity or value object type, or change the field type to "DangerousGoodsInfo".`);
        });
    });

    describe('with child entity type', () => {
        it('accepts child entities embedded in root entities', () => {
            const field = new Field({
                name: 'items',
                typeName: 'Item',
                isList: true
            }, deliveryType);

            expectToBeValid(field);
        });

        it('accepts child entities embedded in child entities', () => {
            const field = new Field({
                name: 'items',
                typeName: 'Item',
                isList: true
            }, itemType);

            expectToBeValid(field);
        });

        it('accepts child entities embedded in entity extensions', () => {
            const field = new Field({
                name: 'items',
                typeName: 'Item',
                isList: true
            }, dangerousGoodsInfoType);

            expectToBeValid(field);
        });

        it('rejects child entities embedded in value objects', () => {
            const field = new Field({
                name: 'items',
                typeName: 'Item',
                isList: true
            }, addressType);

            expectSingleErrorToInclude(field, `Type "Item" is an entity extension and can not be used within value object types. Change "Address" to an entity extension type or use a value object type for "items".`);
        });

        it('rejects child entity types on non-list fields', () => {
            const field = new Field({
                name: 'items',
                typeName: 'Item',
                isList: false
            }, deliveryType);

            expectSingleErrorToInclude(field, `Type "Item" can only be used in a list because it is a child entity type. Use an entity extension or value object type, or change the field type to "[Item]".`);
        });
    });

    describe('with default value', () => {
        it('accepts on scalar types', () => {
            const field = new Field({
                name: 'amount',
                typeName: 'Int',
                defaultValue: 123
            }, itemType);

            const res = validate(field);
            expect(res.messages.length, res.toString()).to.equal(1);
            expect(res.messages[0].severity, res.toString()).to.equal(Severity.Info); // warning about no type checking for default values
        });

        it('rejects on value object types', () => {
            const field = new Field({
                name: 'address',
                typeName: 'Address',
                defaultValue: 123
            }, deliveryType);

            expectSingleErrorToInclude(field, `Default values are only supported on scalar and enum fields`);
        });
    });

    describe('with permissions', () => {
        describe('with permission profile', () => {
            const field = new Field({
                name: 'totalAmount',
                typeName: 'Int',
                permissions: {
                    permissionProfileName: 'accounting'
                }
            }, deliveryType);

            it('accepts', () => {
                expectToBeValid(field);
            });

            it('resolves permission profile', () => {
                expect(field.permissionProfile).to.equal(model.getPermissionProfileOrThrow('accounting'));
            });
        });

        it('accepts direct role specifier', () => {
            const field = new Field({
                name: 'totalAmount',
                typeName: 'Int',
                permissions: {
                    roles: {
                        read: ['accounting'],
                        readWrite: ['admin']
                    }
                }
            }, deliveryType);

            expectToBeValid(field);
        });

        it('rejects combining roles and permission profiles', () => {
            const field = new Field({
                name: 'totalAmount',
                typeName: 'Int',
                permissions: {
                    permissionProfileName: 'accounting',
                    roles: {
                        read: ['accounting'],
                        readWrite: ['admin']
                    }
                }
            }, deliveryType);

            const result = validate(field);
            expect(result.messages.length).to.equal(2);
            for (const message of result.messages) {
                expect(message.severity).to.equal(Severity.Error);
                expect(message.message).to.equal(`Permission profile and explicit role specifiers can not be combined`);
            }
        });

        it('rejects missing permission profile', () => {
            const field = new Field({
                name: 'totalAmount',
                typeName: 'Int',
                permissions: {
                    permissionProfileName: 'undefined'
                }
            }, deliveryType);

            expectSingleErrorToInclude(field, `Permission profile "undefined" not found`);
        });
    });

    describe('with calc mutations', () => {
        it('accepts ADD and MULTIPLY on Int', () => {
            const field = new Field({
                name: 'amount',
                typeName: 'Int',
                calcMutationOperators: [CalcMutationsOperator.ADD, CalcMutationsOperator.MULTIPLY]
            }, itemType);

            expectToBeValid(field);
        });

        it('accepts APPEND on String', () => {
            const field = new Field({
                name: 'log',
                typeName: 'String',
                calcMutationOperators: [CalcMutationsOperator.APPEND]
            }, deliveryType);

            expectToBeValid(field);
        });

        it('rejects APPEND on Int', () => {
            const field = new Field({
                name: 'amount',
                typeName: 'Int',
                calcMutationOperators: [CalcMutationsOperator.APPEND]
            }, deliveryType);

            expectSingleErrorToInclude(field, `Calc mutation operator "APPEND" is not supported on type "Int" (supported types: "String").`);
        });

        it('rejects MULTIPLY on String', () => {
            const field = new Field({
                name: 'deliveryNumber',
                typeName: 'String',
                calcMutationOperators: [CalcMutationsOperator.MULTIPLY]
            }, deliveryType);

            expectSingleErrorToInclude(field, `Calc mutation operator "MULTIPLY" is not supported on type "String" (supported types: "Int", "Float").`);
        });

        it('rejects APPEND on lists', () => {
            const field = new Field({
                name: 'amount',
                typeName: 'String',
                isList: true,
                calcMutationOperators: [CalcMutationsOperator.APPEND]
            }, deliveryType);

            expectSingleErrorToInclude(field, `Calc mutations are not supported on list fields.`);
        });
    });
});
