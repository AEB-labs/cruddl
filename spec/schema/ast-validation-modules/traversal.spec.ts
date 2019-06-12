import { expect } from 'chai';
import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';

describe('traversal validation', () => {
    it('accepts to-n-to-n traversal', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                deliveryNumber: String
                handlingUnits: [HandlingUnit] @relation
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                allHandlingUnits: [HandlingUnit] @traversal(path: "deliveries.handlingUnits")
            }
        `);
    });

    it('accepts to-1-to-n traversals', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                deliveryNumber: String
                shipment: Shipment @relation(inverseOf: "deliveries")
                handlingUnits: [HandlingUnit] @relation
                shipmentHandlingUnits: [HandlingUnit] @traversal(path: "shipment.allHandlingUnits")
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                allHandlingUnits: [HandlingUnit] @traversal(path: "deliveries.handlingUnits")
            }
        `);
    });

    it('accepts nested traversals', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
                childHandlingUnits: [HandlingUnit] @relation
            }
            type Delivery @rootEntity {
                deliveryNumber: String
                handlingUnits: [HandlingUnit] @relation
                innerHandlingUnits: [HandlingUnit] @traversal(path: "handlingUnits.childHandlingUnits")
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                allInnerHandlingUnits: [HandlingUnit] @traversal(path: "deliveries.innerHandlingUnits")
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
                shipmentHandlingUnits: [HandlingUnit] @traversal(path: "shipment.allHandlingUnits")
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                allHandlingUnits: [HandlingUnit] @traversal(path: "deliveries.shipmentHandlingUnits")
            }
        `);
        expect(result.getErrors().map(e => e.message)).to.deep.equal([
            `Traversal field "allHandlingUnits" cannot be used here because it would cause a recursion.`,
            `Traversal field "shipmentHandlingUnits" cannot be used here because it would cause a recursion.`
        ]);
    });

    it('allows traversal to scalars', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                handlingUnitNumbers: [String] @traversal(path: "handlingUnits.handlingUnitNumber")
            }
        `);
    });

    it('rejects traversal with missing list type', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                hu: HandlingUnit @traversal(path: "handlingUnits")
            }
        `, `This field should be a declared as a list because the traversal path results in a list.`);
    });

    it('rejects traversal with wrongly declared list type', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                handlingUnit: HandlingUnit @relation
                hus: [HandlingUnit] @traversal(path: "handlingUnit")
            }
        `, `This field should not be a declared as a list because the traversal path does not result in a list.`);
    });

    it('rejects traversal with wrong field type', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                hus: [Delivery] @traversal(path: "handlingUnits")
            }
        `, `The traversal path results in type "HandlingUnit", but this field is declared with type "Delivery".`);
    });

    it('rejects unknown field in path', () => {
        assertValidatorRejects(`
            type Delivery @rootEntity {
                hus: [Delivery] @traversal(path: "handlingUnits")
            }
        `, `Type "Delivery" does not have a field "handlingUnits".`);
    });

    it('rejects references in path', () => {
        assertValidatorRejects(`
            type Country @rootEntity {
                isoCode: String @key
            }
            type Delivery @rootEntity {
                country: Country @reference
                c: Country @traversal(path: "country")
            }
        `, `Field "Delivery.country" is a reference and cannot be used in a traversal.`);
    });

    it('rejects missing path', () => {
        assertValidatorRejects(`
            type Country @rootEntity {
                isoCode: String @key
            }
            type Delivery @rootEntity {
                tra: Country @traversal
            }
        `, `Directive "@traversal" argument "path" of type "String!" is required, but it was not provided.`);
    });

    it('rejects empty path', () => {
        assertValidatorRejects(`
            type Country @rootEntity {
                isoCode: String @key
            }
            type Delivery @rootEntity {
                tra: Country @traversal(path: "")
            }
        `, `The path cannot be empty.`);
    });

    it('rejects combined with relation', () => {
        assertValidatorRejects(`
            type Delivery @rootEntity {
                tra: Delivery @relation @traversal(path: "tra")
            }
        `, `@traversal and @relation cannot be combined.`);
    });

    it('rejects depth specifier on child entities', () => {
        assertValidatorRejects(`
            type Item @childEntity {
                subItems: [Item]
            }
            type Delivery @rootEntity {
                items: [Item]
                allItems: [Item] @traversal(path: "items.subItems{0,3}")
            }
        `, `A depth specifier is only valid for relation fields, and field "Item.subItems" is not a relation.`);
    });

    it('rejects depth specifier on non-self relations', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                handlingUnitNumber: String
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                allHandlingUnits: [HandlingUnit] @traversal(path: "handlingUnits{0,3}")
            }
        `, `A depth specifier is only valid for recursive relation fields, and field "Delivery.handlingUnits" is not of type "Delivery", but of type "HandlingUnit".`);
    });

    it('rejects depth specifier greater than 1 on to-1 relations', () => {
        assertValidatorRejects(`
            type Delivery @rootEntity {
                siblingDelivery: Delivery @relation
                thisAndSiblings: [Delivery] @traversal(path: "siblingDelivery{0,2}")
            }
        `, `The maximum depth of "Delivery.siblingDelivery" cannot be higher than 1 because it is a to-1 relation.`);
    });

    it('accept depth specifier of 0..1 on to-1 relations', () => {
        assertValidatorAccepts(`
            type Delivery @rootEntity {
                siblingDelivery: Delivery @relation
                thisAndSibling: [Delivery] @traversal(path: "siblingDelivery{0,1}")
            }
        `);
    });
});
