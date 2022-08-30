import { expect } from 'chai';
import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';

describe('collect validation', () => {
    describe('without aggregate', () => {
        it('accepts to-n-to-n traversal', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    delivery: Delivery @relation(inverseOf: "handlingUnits")
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    handlingUnits: [HandlingUnit] @relation
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
                }
            `);
        });

        it('rejects to-n-then-m-to-n traversal because of possible duplicates', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    handlingUnits: [HandlingUnit] @relation
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
                }
            `,
                `The path can produce duplicate HandlingUnit entities (because the relation target type "HandlingUnit" does not declare an inverse relation field to "Delivery.handlingUnits"). Please set argument "aggregate" to "DISTINCT" to filter out duplicates and null items if you don't want any other aggregation.`,
            );
        });

        it('accepts to-1-to-n-to-n traversals', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    delivery: Delivery @relation(inverseOf: "handlingUnits")
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    handlingUnits: [HandlingUnit] @relation
                    shipmentHandlingUnits: [HandlingUnit] @collect(path: "shipment.deliveries.handlingUnits")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                }
            `);
        });

        it('rejects to-1-to-n-to-n traversals if last segment is m-to-n because of possible duplicates', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    deliveries: [Delivery] @relation(inverseOf: "handlingUnits")
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    handlingUnits: [HandlingUnit] @relation
                    shipmentHandlingUnits: [HandlingUnit] @collect(path: "shipment.deliveries.handlingUnits")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                }
            `,
                `The path can produce duplicate HandlingUnit entities (because "HandlingUnit.deliveries", which is the inverse relation field to "Delivery.handlingUnits", is declared as a list). Please set argument "aggregate" to "DISTINCT" to filter out duplicates and null items if you don't want any other aggregation.`,
            );
        });

        it('accepts to-1-to-n traversals', () => {
            assertValidatorAccepts(`
                type Delivery @rootEntity {
                    deliveryNumber: String
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    shipmentHandlingUnits: [Delivery] @collect(path: "shipment.deliveries")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                }
            `);
        });

        it('accepts indirect to-1-to-n traversals', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    delivery: Delivery @relation(inverseOf: "handlingUnits")
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    handlingUnits: [HandlingUnit] @relation
                    shipmentHandlingUnits: [HandlingUnit] @collect(path: "shipment.allHandlingUnits")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
                }
            `);
        });

        it('rejects indirect to-n-to-n traversals due to possible duplicates', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    delivery: Delivery @relation(inverseOf: "handlingUnits")
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    handlingUnits: [HandlingUnit] @relation
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
                }
                type Order @rootEntity {
                    shipments: [Shipment] @relation
                    shipmentHandlingUnits: [HandlingUnit] @collect(path: "shipments.allHandlingUnits")
                }
            `,
                `The path can produce duplicate HandlingUnit entities. Please set argument "aggregate" to "DISTINCT" to filter out duplicates and null items if you don't want any other aggregation.`,
            );
        });

        it('accepts nested traversals', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    delivery: Delivery @relation(inverseOf: "handlingUnits")
                    parentHandlingUnit: HandlingUnit @relation(inverseOf: "childHandlingUnits")
                    childHandlingUnits: [HandlingUnit] @relation
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    handlingUnits: [HandlingUnit] @relation
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    innerHandlingUnits: [HandlingUnit] @collect(path: "handlingUnits.childHandlingUnits")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "deliveries.innerHandlingUnits")
                }
            `);
        });

        it('rejects recursively nested traversals', () => {
            const result = validate(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    handlingUnits: [HandlingUnit] @relation
                    shipmentHandlingUnits: [HandlingUnit] @collect(path: "shipment.allHandlingUnits")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.shipmentHandlingUnits")
                }
            `);
            expect(result.getErrors().map((e) => e.message)).to.deep.equal([
                `Collect field "allHandlingUnits" cannot be used here because it would cause a recursion.`,
                `Collect field "shipmentHandlingUnits" cannot be used here because it would cause a recursion.`,
            ]);
        });

        it('rejects indirectly recursively nested traversals', () => {
            const result = validate(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    shipment: Shipment @relation(inverseOf: "deliveries")
                    handlingUnits: [HandlingUnit] @relation
                    shipmentHandlingUnits: [HandlingUnit] @collect(path: "shipment.order.allHandlingUnits")
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    order: Order @relation(inverseOf: "shipment")
                }
                type Order @rootEntity {
                    shipment: Shipment @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "shipment.deliveries.shipmentHandlingUnits")
                }
            `);
            expect(result.getErrors().map((e) => e.message)).to.deep.equal([
                `Collect field "allHandlingUnits" cannot be used here because it would cause a recursion.`,
                `Collect field "shipmentHandlingUnits" cannot be used here because it would cause a recursion.`,
            ]);
        });

        it('rejects using nested collect paths with validation errors', () => {
            const result = validate(`
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{1,3}")
                }
                type Delivery @rootEntity {
                    deliveryNumber: String
                    handlingUnits: [HandlingUnit] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "handlingUnits.allInnerHandlingUnits")
                }
            `);
            expect(result.getErrors().map((e) => e.message)).to.deep.equal([
                `Type "HandlingUnit" does not have a field "childHandlingUnits".`,
                `The collect path of "HandlingUnit.allInnerHandlingUnits" has validation errors.`,
            ]);
        });

        it('rejects traversal to scalars without aggregation', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    handlingUnitNumbers: [String] @collect(path: "handlingUnits.handlingUnitNumber")
                }
            `,
                `The collect path results in scalar type "String", but scalars cannot be collected without aggregating them.  You may want to use the "DISTINCT" aggregation.`,
            );
        });

        it('rejects traversal with missing list type', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    hu: HandlingUnit @collect(path: "handlingUnits")
                }
            `,
                `This collect field should be a declared as a list.`,
            );
        });

        it('rejects a path that does not result in a list', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    handlingUnit: HandlingUnit @relation
                    hus: [HandlingUnit] @collect(path: "handlingUnit")
                }
            `,
                `The path does not result in a list.`,
            );
        });

        it('rejects traversal with wrong field type', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    hus: [Delivery] @collect(path: "handlingUnits")
                }
            `,
                `The collect path results in type "HandlingUnit", but this field is declared with type "Delivery".`,
            );
        });

        it('rejects empty paths', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    deliveries: [Delivery] @collect(path: "")
                }
            `,
                `The path cannot be empty.`,
            );
        });

        it('rejects paths with empty segments', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    childDelivery: Delivery @relation
                    deliveries: [Delivery] @collect(path: "childDelivery..childDelivery")
                }
            `,
                `The path should consist of dot-separated segments.`,
            );
        });

        it('rejects paths with invalid segments', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    childDelivery: Delivery @relation
                    deliveries: [Delivery] @collect(path: "childDelivery.!")
                }
            `,
                `The path segment "!" is invalid. It should be a field name, optionally followed by a depth specifier like {1,2}.`,
            );
        });

        it('rejects navigating into fields of non-objects', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    deliveries: [Delivery] @collect(path: "deliveryNumber.delivery")
                    deliveryNumber: String
                }
            `,
                `Type "String" is not an object type and cannot be navigated into.`,
            );
        });

        it('rejects unknown field in path', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    hus: [Delivery] @collect(path: "handlingUnits")
                }
            `,
                `Type "Delivery" does not have a field "handlingUnits".`,
            );
        });

        it('rejects references in path', () => {
            assertValidatorRejects(
                `
                type Country @rootEntity {
                    isoCode: String @key
                }
                type Delivery @rootEntity {
                    country: Country @reference
                    c: Country @collect(path: "country")
                }
            `,
                `Field "Delivery.country" is a reference and cannot be used in a collect path.`,
            );
        });

        it('rejects fields with root-entity type that are neither relation nor reference', () => {
            const result = validate(`
                type Country @rootEntity {
                    isoCode: String @key
                }
                type Delivery @rootEntity {
                    country: Country
                    c: Country @collect(path: "country")
                }
            `);
            expect(result.getErrors().map((e) => e.message)).to.deep.equal([
                `Type "Country" is a root entity type and cannot be embedded. Consider adding @reference or @relation.`,
                `Field "Delivery.country" is a root entity, but not a relation, and cannot be used in a collect path.`,
            ]);
        });

        it('rejects missing path', () => {
            assertValidatorRejects(
                `
                type Country @rootEntity {
                    isoCode: String @key
                }
                type Delivery @rootEntity {
                    tra: Country @collect
                }
            `,
                `Directive "@collect" argument "path" of type "String!" is required, but it was not provided.`,
            );
        });

        it('rejects empty path', () => {
            assertValidatorRejects(
                `
                type Country @rootEntity {
                    isoCode: String @key
                }
                type Delivery @rootEntity {
                    tra: Country @collect(path: "")
                }
            `,
                `The path cannot be empty.`,
            );
        });

        it('rejects combined with relation', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    tra: Delivery @relation @collect(path: "tra")
                }
            `,
                `@collect and @relation cannot be combined.`,
            );
        });

        it('accept depth specifier on to-n relations', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    childHandlingUnits: [HandlingUnit] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{1,3}")
                }
            `);
        });

        it('accept depth specifier with min=0 on to-n relations', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    childHandlingUnits: [HandlingUnit] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{0,3}")
                }
            `);
        });

        it('accept depth specifier with implicit max', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    childHandlingUnits: [HandlingUnit] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{2}")
                }
            `);
        });

        it('rejects depth specifier if min=max=0', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    childHandlingUnits: [HandlingUnit] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{0}")
                }
            `,
                `The maximum depth cannot be zero.`,
            );
        });

        it('rejects depth specifier if max < min', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    childHandlingUnits: [HandlingUnit] @relation
                    allInnerHandlingUnits: [HandlingUnit] @collect(path: "childHandlingUnits{2,1}")
                }
            `,
                `The maximum depth (1) cannot be lower than the minimum depth (2).`,
            );
        });

        it('rejects depth specifier on child entities', () => {
            assertValidatorRejects(
                `
                type Item @childEntity {
                    subItems: [Item]
                }
                type Delivery @rootEntity {
                    items: [Item]
                    allItems: [Item] @collect(path: "items.subItems{0,3}")
                }
            `,
                `A depth specifier is only valid for relation fields, and field "Item.subItems" is not a relation.`,
            );
        });

        it('rejects depth specifier on non-self relations', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    handlingUnitNumber: String
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "handlingUnits{0,3}")
                }
            `,
                `A depth specifier is only valid for recursive relation fields, and field "Delivery.handlingUnits" is not of type "Delivery", but of type "HandlingUnit".`,
            );
        });

        it('rejects depth specifier greater than 1 on to-1 relations', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    siblingDelivery: Delivery @relation
                    thisAndSiblings: [Delivery] @collect(path: "siblingDelivery{0,2}")
                }
            `,
                `The maximum depth of "Delivery.siblingDelivery" cannot be higher than 1 because it is a to-1 relation.`,
            );
        });

        it('accepts depth specifier of 0..1 on to-1 relations but rejects because of possible duplicates', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    siblingDelivery: Delivery @relation
                    thisAndSibling: [Delivery] @collect(path: "siblingDelivery{0,1}")
                }
            `,
                `The collect path can produce items that are null because "Delivery.siblingDelivery" can be null. Please set argument "aggregate" to "DISTINCT" to filter out null items if you don't want any other aggregation.`,
            );
        });
    });

    describe('with aggregate', () => {
        it('accepts sum aggregation', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    totalWeightInKg: Float
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalWeightInKg: Float @collect(path: "handlingUnits.totalWeightInKg", aggregate: SUM)
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    totalWeightInKg: Float @collect(path: "deliveries.handlingUnits.totalWeightInKg", aggregate: SUM)
                }
            `);
        });

        it('rejects wrong field type for SUM', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    totalWeightInKg: Float
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalWeightInKg: Int @collect(path: "handlingUnits.totalWeightInKg", aggregate: SUM)
                }
            `,
                `The aggregation results in type "Float", but this field is declared with type "Int".`,
            );
        });

        it('rejects wrong field type for COUNT', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    totalWeightInKg: Float
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalWeightInKg: Float @collect(path: "handlingUnits", aggregate: COUNT)
                }
            `,
                `The aggregation results in type "Int", but this field is declared with type "Float".`,
            );
        });

        it('rejects wrongly declared list', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    totalWeightInKg: Float
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalWeightInKg: [Int] @collect(path: "handlingUnits", aggregate: COUNT)
                }
            `,
                `This aggregation field should not be declared as a list.`,
            );
        });

        it('rejects SUM on DateTimes', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    totalWeightInKg: Float
                    packedAt: DateTime
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    packedAtCount: Int @collect(path: "handlingUnits", aggregate: COUNT)
                    totalPackedAt: DateTime @collect(path: "handlingUnits.packedAt", aggregate: SUM)
                }
            `,
                `Aggregation operator "SUM" is not supported on type "DateTime" (supported types: "Int", "Int53", "Float", "Decimal1", "Decimal2", "Decimal3").`,
            );
        });

        it('accepts MAX on OffsetDateTime', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    packedAt: OffsetDateTime
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalPackedAt: DateTime @collect(path: "handlingUnits.packedAt", aggregate: MAX)
                }
            `);
        });

        it('rejects MAX on OffsetDateTime with OffsetDateTime as collect field type', () => {
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    packedAt: OffsetDateTime
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalPackedAt: OffsetDateTime @collect(path: "handlingUnits.packedAt", aggregate: MAX)
                }
            `,
                'The aggregation results in type "DateTime", but this field is declared with type "OffsetDateTime".',
            );
        });

        it('accepts collect fields within aggregation paths', () => {
            assertValidatorAccepts(`
                type HandlingUnit @rootEntity {
                    weightInKg: Float
                    delivery: Delivery @relation(inverseOf: "handlingUnits")
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
                    totalWeightInKg: Float @collect(path: "allHandlingUnits.weightInKg", aggregate: SUM)
                }
            `);
        });

        it('rejects aggregations within aggregation paths', () => {
            // would need extra handling, may support in the future. stuff like average would be ambiguous though.
            assertValidatorRejects(
                `
                type HandlingUnit @rootEntity {
                    weightInKg: Float
                }
                type Delivery @rootEntity {
                    handlingUnits: [HandlingUnit] @relation
                    totalWeightInKg: Float @collect(path: "handlingUnits.weightInKg", aggregate: SUM)
                }
                type Shipment @rootEntity {
                    deliveries: [Delivery] @relation
                    totalWeightInKg: Float @collect(path: "deliveries.totalWeightInKg", aggregate: SUM)
                }
            `,
                `Field "Delivery.totalWeightInKg" is an aggregation field and cannot be used in a collect path.`,
            );
        });

        it('rejects parent fields within the path', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    this: [Delivery] @collect(path: "children.children.parent")
                    children: [Child]
                }

                type Child @childEntity {
                    children: [Grandchild]
                }

                type Grandchild @childEntity {
                name: String
                    parent: Child @parent
                }
            `,
                `Field "Grandchild.parent" is a parent field and cannot be used in a collect path.`,
            );
        });

        it('rejects root fields within the path', () => {
            assertValidatorRejects(
                `
                type Delivery @rootEntity {
                    this: [Delivery] @collect(path: "children.parent")
                    children: [Child]
                }

                type Child @childEntity {
                name: String
                    parent: Delivery @root
                }
            `,
                `Field "Child.parent" is a root field and cannot be used in a collect path.`,
            );
        });

        describe('distinct', () => {
            it('is supported on strings', () => {
                assertValidatorAccepts(`
                    type Delivery @rootEntity {
                        keys: [String]
                        distinctKeys: [String] @collect(path: "keys", aggregate: DISTINCT)
                    }
                `);
            });

            it('is supported on enums', () => {
                assertValidatorAccepts(`
                    enum Kind { OBJECT, TYPE, FIELD }

                    type Delivery @rootEntity {
                        kinds: [Kind]
                        distinctKinds: [Kind] @collect(path: "kinds", aggregate: DISTINCT)
                    }
                `);
            });

            it('is not supported on entity extensions', () => {
                assertValidatorRejects(
                    `
                    type ItemExtension @entityExtension {
                        code: String
                    }

                    type Item @childEntity {
                        extension: ItemExtension
                    }

                    type Delivery @rootEntity {
                        items: [Item]
                        distinctItemExtensions: [ItemExtension] @collect(path: "items.extension", aggregate: DISTINCT)
                    }
                `,
                    'Aggregation operator "DISTINCT" is not supported on entity extension types. You can instead collect the parent objects by removing the last path segment.',
                );
            });

            it('is supported on simple value objects', () => {
                assertValidatorAccepts(`
                    enum Kind { OBJECT, TYPE, FIELD }

                    type Identifier @valueObject {
                        kind: Kind
                        id: String
                    }

                    type Delivery @rootEntity {
                        identifiers: [Identifier]
                        distinctIdentifiers: [Identifier] @collect(path: "identifiers", aggregate: DISTINCT)
                    }
                `);
            });

            it('is supported on value objects containing floats', () => {
                assertValidatorRejects(
                    `
                    enum VolumeUnit { M3, LITER, BARRELS }

                    type Volume @valueObject {
                        unit: VolumeUnit
                        value: Float
                    }

                    type Delivery @rootEntity {
                        volumes: [Volume]
                        distinctVolumes: [Volume] @collect(path: "volumes", aggregate: DISTINCT)
                    }
                `,
                    'Aggregation operator "DISTINCT" is not supported on value object type "Volume" because its field "value" has a type that does not support this operator.',
                );
            });
        });
    });
});
