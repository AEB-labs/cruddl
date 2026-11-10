/**
 * Test data for the differential filter test
 *
 * The values are deliberately chosen to hit edge cases: null and missing fields, empty and missing
 * lists, duplicates within scalar lists, strings that only differ in case or contain LIKE
 * placeholders, references to keys that do not exist, unset entity extensions, entities that are
 * not reachable via relations, and a relation chain that is deeper than the relation depth ranges
 * in the model.
 *
 * Root entities are created first (without relations), then the relations are added.
 */

export type TestDataObject = { readonly [field: string]: unknown };

export interface TestData {
    /** The entities to create, per root entity type */
    readonly entities: { readonly [typeName: string]: ReadonlyArray<TestDataObject> };

    /**
     * Relations to set after all entities exist. The keys of the target entities are replaced by
     * their ids.
     */
    readonly relations: ReadonlyArray<RelationTestData>;
}

export interface RelationTestData {
    readonly typeName: string;
    readonly key: string;

    /** a field of the update input type, e.g. "addDeliveries" or "delivery" */
    readonly inputField: string;
    readonly targetTypeName: string;
    readonly targetKeys: string | ReadonlyArray<string>;
}

/**
 * The field of each type whose values are unique across the test data
 *
 * Results are reduced to this field to compare them regardless of internal ids.
 */
export const IDENTIFIER_FIELDS: { readonly [typeName: string]: string } = {
    Shipment: 'shipmentNumber',
    Order: 'orderNumber',
    Delivery: 'deliveryNumber',
    DeliveryItem: 'itemNumber',
    Package: 'packageNumber',
    HandlingUnit: 'handlingUnitNumber',
    PackedItem: 'packedItemNumber',
    Article: 'articleNumber',
    Country: 'isoCode',
};

export const TEST_DATA: TestData = {
    entities: {
        Country: [
            { isoCode: 'DE', name: 'Germany' },
            { isoCode: 'US', name: null },
        ],
        Article: [
            { articleNumber: 'A1', description: 'Alpha', isDangerous: true, tags: ['red', 'Blue'] },
            { articleNumber: 'A2', description: 'alpha', isDangerous: false, tags: [] },
            // isDangerous and tags not set
            { articleNumber: 'A3', description: '' },
            { articleNumber: 'A4', description: null, tags: ['red', 'red'] },
        ],
        Shipment: [
            { shipmentNumber: 'S1', priority: 1 },
            { shipmentNumber: 'S2', priority: 0 },
            // no relations at all
            { shipmentNumber: 'S3' },
        ],
        Order: [
            { orderNumber: 'O1', description: 'Beta' },
            { orderNumber: 'O2', description: 'x_y' },
            // no delivery
            { orderNumber: 'O3' },
        ],
        Delivery: [
            {
                deliveryNumber: 'D1',
                description: 'Alpha',
                colors: ['RED', 'GREEN'],
                destinationCountryCode: 'DE',
                items: [
                    {
                        itemNumber: 'D1-I1',
                        description: 'Alpha',
                        quantity: 5,
                        weight: 1.5,
                        isDangerous: true,
                        color: 'RED',
                        shippedAt: '2026-01-01T10:00:00Z',
                        deliveryDate: '2026-01-01',
                        tags: ['red', 'Blue'],
                        quantities: [1, 2],
                        articleNumber: 'A1',
                        details: { origin: 'Berlin', originCountryCode: 'DE' },
                        packages: [
                            {
                                packageNumber: 'D1-I1-P1',
                                quantity: 1,
                                tags: ['fragile'],
                                materialArticleNumber: 'A2',
                            },
                            // same content as the first package except for the number
                            {
                                packageNumber: 'D1-I1-P2',
                                quantity: 1,
                                tags: ['fragile'],
                                materialArticleNumber: 'A2',
                            },
                        ],
                        subItems: [
                            {
                                itemNumber: 'D1-I1-S1',
                                description: 'alpha',
                                quantity: 0,
                                tags: [''],
                                articleNumber: 'A9', // does not exist
                                subItems: [
                                    { itemNumber: 'D1-I1-S1-S1', quantity: 1, tags: ['red'] },
                                ],
                            },
                            {
                                itemNumber: 'D1-I1-S2',
                                quantity: -1,
                                isDangerous: false,
                                quantities: [],
                                subItems: [],
                            },
                        ],
                    },
                    {
                        itemNumber: 'D1-I2',
                        description: 'Beta',
                        quantity: 1,
                        weight: 0,
                        isDangerous: false,
                        color: 'GREEN',
                        // the same instant as D1-I1, with milliseconds
                        shippedAt: '2026-01-01T10:00:00.000Z',
                        deliveryDate: '2026-02-15',
                        tags: [],
                        quantities: [0],
                        articleNumber: 'A2',
                        details: { origin: 'Paris', originCountryCode: 'XX' }, // country does not exist
                        packages: [],
                        subItems: [
                            {
                                itemNumber: 'D1-I2-S1',
                                description: 'Beta',
                                quantity: 5,
                                articleNumber: 'A1',
                                packages: [{ packageNumber: 'D1-I2-S1-P1', quantity: null }],
                            },
                        ],
                    },
                    // only the identifier is set
                    { itemNumber: 'D1-I3' },
                ],
                packages: [
                    {
                        packageNumber: 'D1-P1',
                        quantity: 2,
                        tags: ['fragile', 'heavy'],
                        materialArticleNumber: 'A1',
                    },
                    { packageNumber: 'D1-P2', tags: [] },
                ],
                additions: {
                    note: 'Alpha',
                    items: [
                        {
                            itemNumber: 'D1-X1',
                            description: '',
                            quantity: 2,
                            articleNumber: 'A3',
                            tags: ['heavy'],
                        },
                    ],
                    mainPackage: {
                        packageNumber: 'D1-MP',
                        quantity: 3,
                        materialArticleNumber: 'A9',
                    },
                },
            },
            {
                // additions not set, items not set
                deliveryNumber: 'D2',
                description: 'alpha',
                colors: [],
                destinationCountryCode: 'XX', // does not exist
                packages: [{ packageNumber: 'D2-P1', quantity: 0, materialArticleNumber: 'A4' }],
            },
            {
                deliveryNumber: 'D3',
                description: null,
                colors: ['BLUE', 'BLUE'],
                items: [
                    {
                        itemNumber: 'D3-I1',
                        description: 'x_y',
                        quantity: 3,
                        weight: 0.5,
                        color: 'BLUE',
                        shippedAt: '2026-03-01T00:00:00Z',
                        deliveryDate: '2026-03-01',
                        tags: ['Blue', 'red', 'red'],
                        quantities: [-1, 5],
                        articleNumber: 'A4',
                        details: { origin: null },
                        packages: [{ packageNumber: 'D3-I1-P1', quantity: 5, tags: ['heavy'] }],
                        subItems: [
                            {
                                itemNumber: 'D3-I1-S1',
                                description: '50% off',
                                quantity: 2,
                                isDangerous: true,
                                color: 'RED',
                                tags: ['fragile'],
                                articleNumber: 'A2',
                                details: { origin: 'Berlin', originCountryCode: 'US' },
                            },
                        ],
                    },
                ],
                // additions set, but empty
                additions: { items: [] },
            },
            {
                // not reachable from any shipment or order
                deliveryNumber: 'D4',
                description: 'Beta',
                items: [
                    {
                        itemNumber: 'D4-I1',
                        description: 'Alpha',
                        quantity: 5,
                        tags: ['red'],
                        articleNumber: 'A1',
                        subItems: [{ itemNumber: 'D4-I1-S1', quantity: 5 }],
                    },
                ],
                additions: { note: 'Beta', items: [{ itemNumber: 'D4-X1', quantity: 1 }] },
            },
        ],
        HandlingUnit: [
            {
                handlingUnitNumber: 'H1',
                weight: 10,
                packedItems: [
                    { packedItemNumber: 'H1-1', quantity: 1, articleNumber: 'A1' },
                    { packedItemNumber: 'H1-2', quantity: null, articleNumber: 'A9' },
                ],
            },
            {
                handlingUnitNumber: 'H2',
                weight: 2.5,
                packedItems: [{ packedItemNumber: 'H2-1', quantity: 2, articleNumber: 'A2' }],
            },
            { handlingUnitNumber: 'H3', packedItems: [] },
            {
                // only reachable from H1 with a depth of three
                handlingUnitNumber: 'H4',
                weight: 0,
                packedItems: [{ packedItemNumber: 'H4-1', quantity: 4, articleNumber: 'A3' }],
            },
            {
                handlingUnitNumber: 'H5',
                weight: 1,
                packedItems: [{ packedItemNumber: 'H5-1', quantity: 0 }],
            },
            {
                // not reachable from any shipment
                handlingUnitNumber: 'H6',
                packedItems: [{ packedItemNumber: 'H6-1', quantity: 1, articleNumber: 'A1' }],
            },
        ],
    },
    relations: [
        {
            typeName: 'Shipment',
            key: 'S1',
            inputField: 'addDeliveries',
            targetTypeName: 'Delivery',
            targetKeys: ['D1', 'D2'],
        },
        {
            typeName: 'Shipment',
            key: 'S1',
            inputField: 'addHandlingUnits',
            targetTypeName: 'HandlingUnit',
            targetKeys: ['H1'],
        },
        {
            typeName: 'Shipment',
            key: 'S2',
            inputField: 'addDeliveries',
            targetTypeName: 'Delivery',
            targetKeys: ['D3'],
        },
        {
            typeName: 'Shipment',
            key: 'S2',
            inputField: 'addHandlingUnits',
            targetTypeName: 'HandlingUnit',
            targetKeys: ['H5', 'H3'],
        },
        {
            typeName: 'Order',
            key: 'O1',
            inputField: 'delivery',
            targetTypeName: 'Delivery',
            targetKeys: 'D1',
        },
        {
            typeName: 'Order',
            key: 'O2',
            inputField: 'delivery',
            targetTypeName: 'Delivery',
            targetKeys: 'D3',
        },
        {
            typeName: 'HandlingUnit',
            key: 'H1',
            inputField: 'addChildHandlingUnits',
            targetTypeName: 'HandlingUnit',
            targetKeys: ['H2'],
        },
        {
            typeName: 'HandlingUnit',
            key: 'H2',
            inputField: 'addChildHandlingUnits',
            targetTypeName: 'HandlingUnit',
            targetKeys: ['H3'],
        },
        {
            typeName: 'HandlingUnit',
            key: 'H3',
            inputField: 'addChildHandlingUnits',
            targetTypeName: 'HandlingUnit',
            targetKeys: ['H4'],
        },
        {
            typeName: 'Article',
            key: 'A1',
            inputField: 'addReplacements',
            targetTypeName: 'Article',
            targetKeys: ['A2', 'A3'],
        },
    ],
};
