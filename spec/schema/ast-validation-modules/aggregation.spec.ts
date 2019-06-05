import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

describe('aggregation validation', () => {
    it('accepts sum aggregation', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity {
                totalWeightInKg: Float
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                totalWeightInKg: Float @aggregation(path: "handlingUnits.totalWeightInKg", aggregator: SUM)
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                totalWeightInKg: Float @aggregation(path: "deliveries.handlingUnits.totalWeightInKg", aggregator: SUM)
            }
        `);
    });

    it('rejects wrong field type for SUM', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                totalWeightInKg: Float
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                totalWeightInKg: Int @aggregation(path: "handlingUnits.totalWeightInKg", aggregator: SUM)
            }
        `, `The aggregation results in type "Float", but this field is declared with type "Int".`);
    });

    it('rejects wrong field type for COUNT', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                totalWeightInKg: Float
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                totalWeightInKg: Float @aggregation(path: "handlingUnits.totalWeightInKg", aggregator: COUNT)
            }
        `, `The type of an @aggregation field with aggregator "COUNT" should be "Int".`);
    });

    it('rejects wrongly declared list', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                totalWeightInKg: Float
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                totalWeightInKg: [Int] @aggregation(path: "handlingUnits.totalWeightInKg", aggregator: COUNT)
            }
        `, `This @aggregation field should not be a list.`);
    });

    it('rejects SUM on DateTimes', () => {
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                totalWeightInKg: Float
                packedAt: DateTime
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                packedAtCount: Int @aggregation(path: "handlingUnits.packedAt", aggregator: COUNT)
                totalPackedAt: DateTime @aggregation(path: "handlingUnits.packedAt", aggregator: SUM)
            }
        `, `Aggregator "SUM" is not supported on type "DateTime" (supported types: "Int", "Float").`);
    });

    it('accepts traversals within aggregation paths', () => {
        assertValidatorAccepts(`
            type HandlingUnit @rootEntity {
                weightInKg: Float
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                allHandlingUnits: [HandlingUnit] @traversal(path: "deliveries.handlingUnits")
                totalWeightInKg: Float @aggregation(path: "allHandlingUnits.weightInKg", aggregator: SUM)
            }
        `);
    });

    it('rejects aggregations within aggregation paths', () => {
        // would need extra handling, may support in the future. stuff like average would be ambiguous though.
        assertValidatorRejects(`
            type HandlingUnit @rootEntity {
                weightInKg: Float
            }
            type Delivery @rootEntity {
                handlingUnits: [HandlingUnit] @relation
                totalWeightInKg: Float @aggregation(path: "handlingUnits.weightInKg", aggregator: SUM)
            }
            type Shipment @rootEntity {
                deliveries: [Delivery] @relation
                totalWeightInKg: Float @aggregation(path: "deliveries.totalWeightInKg", aggregator: SUM)
            }
        `, `Field "Delivery.totalWeightInKg" is an aggregation field and cannot be used in a traversal.`);
    });
});
