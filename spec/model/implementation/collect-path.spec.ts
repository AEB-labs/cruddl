import { expect } from 'chai';
import {
    CollectPath,
    CollectPathSegment,
    Model,
    TypeKind,
    ValidationContext,
} from '../../../src/model';

describe('CollectPath', () => {
    const model = new Model({
        types: [
            {
                name: 'Item',
                kind: TypeKind.CHILD_ENTITY,
                fields: [
                    {
                        name: 'itemNumber',
                        typeName: 'String',
                    },
                ],
            },
            {
                name: 'DangerousGoodsInfo',
                kind: TypeKind.ENTITY_EXTENSION,
                fields: [
                    {
                        name: 'dangerousItems',
                        typeName: 'Item',
                        isList: true,
                    },
                ],
            },
            {
                name: 'DeliveryContent',
                kind: TypeKind.CHILD_ENTITY,
                fields: [
                    {
                        name: 'items',
                        typeName: 'Item',
                        isList: true,
                    },
                    {
                        name: 'subContents',
                        typeName: 'DeliveryContent',
                        isList: true,
                    },
                ],
            },
            {
                name: 'Order',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isList: true,
                        isRelation: true,
                    },
                    {
                        name: 'delivery',
                        typeName: 'Delivery',
                        isRelation: true,
                        inverseOfFieldName: 'order',
                    },
                ],
            },
            {
                name: 'PurchaseOrder',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isList: true,
                        isRelation: true,
                    },
                    {
                        name: 'delivery',
                        typeName: 'Delivery',
                        isRelation: true,
                        inverseOfFieldName: 'order',
                    },
                    {
                        name: 'shipment',
                        typeName: 'Shipment',
                        isRelation: true,
                        inverseOfFieldName: 'purchaseOrder',
                    },
                ],
            },
            {
                name: 'Shipment',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'shipmentNumber',
                        typeName: 'String',
                    },
                    {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isList: true,
                        isRelation: true,
                    },
                    {
                        name: 'order',
                        typeName: 'Order',
                        isRelation: true,
                    },
                    {
                        name: 'purchaseOrder',
                        typeName: 'PurchaseOrder',
                        isRelation: true,
                    },
                ],
            },
            {
                name: 'HandlingUnit',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'handlingUnitNumber',
                        typeName: 'String',
                    },
                    {
                        name: 'childHandlingUnits',
                        typeName: 'HandlingUnit',
                        isList: true,
                        isRelation: true,
                    },
                    {
                        name: 'parentHandlingUnit',
                        typeName: 'HandlingUnit',
                        isRelation: true,
                        inverseOfFieldName: 'childHandlingUnits',
                    },
                    {
                        name: 'items',
                        typeName: 'Item',
                        isList: true,
                    },
                ],
            },
            {
                name: 'Delivery',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'deliveryNumber',
                        typeName: 'String',
                    },
                    {
                        name: 'items',
                        typeName: 'Item',
                        isList: true,
                    },
                    {
                        name: 'contents',
                        typeName: 'DeliveryContent',
                        isList: true,
                    },
                    {
                        name: 'dangerousGoodsInfo',
                        typeName: 'DangerousGoodsInfo',
                    },
                    {
                        name: 'order',
                        typeName: 'Order',
                        isRelation: true,
                    },
                    {
                        name: 'shipments',
                        typeName: 'Shipment',
                        isRelation: true,
                        isList: true,
                    },
                    {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isRelation: true,
                        isList: true,
                    },
                ],
            },
        ],
    });

    const shipmentType = model.getRootEntityTypeOrThrow('Shipment');
    const handlingUnitType = model.getRootEntityTypeOrThrow('HandlingUnit');
    const orderType = model.getRootEntityTypeOrThrow('Order');
    const purchaseOrderType = model.getRootEntityTypeOrThrow('PurchaseOrder');
    const itemType = model.getChildEntityTypeOrThrow('Item');
    const dangerousGoodsInfoType = model.getEntityExtensionTypeOrThrow('DangerousGoodsInfo');
    const deliveryContentType = model.getChildEntityTypeOrThrow('DeliveryContent');
    const deliveryType = model.getRootEntityTypeOrThrow('Delivery');

    function assertSegmentsEqual(
        path: CollectPath,
        expectedSegments: ReadonlyArray<CollectPathSegment>,
    ) {
        const context = new ValidationContext();
        path.validate(context);
        const errors = context.asResult().getErrors();
        expect(errors, errors.map((e) => e.toString()).join('\n')).to.be.empty;

        const actualSegments = path.segments;
        // don't use deep.equal because it would deep-compare the Field instnaces which are *really* deep (with graphql stuff)
        expect(actualSegments).to.have.lengthOf(expectedSegments.length);
        for (let i = 0; i < expectedSegments.length; i++) {
            const actual = actualSegments[i];
            const expected = expectedSegments[i];
            for (const key of Object.keys(expected)) {
                expect((actual as any)[key], key).to.equal((expected as any)[key]);
            }
        }
    }

    it('resolves direct to-n relations', () => {
        const path = new CollectPath({ path: 'shipments' }, deliveryType);
        const shipmentsField = deliveryType.getFieldOrThrow('shipments');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: shipmentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: shipmentsField,
                relationSide: shipmentsField.getRelationSideOrThrow(),
            } as const,
        ]);
        expect(path.resultingType).to.equal(shipmentType);
    });

    it('resolves direct to-1 relations', () => {
        const path = new CollectPath({ path: 'order' }, deliveryType);
        const orderField = deliveryType.getFieldOrThrow('order');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: orderType,
                isListSegment: false,
                resultIsList: false,
                isNullableSegment: true,
                resultIsNullable: true,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: orderField,
                relationSide: orderField.getRelationSideOrThrow(),
            } as const,
        ]);
        expect(path.resultingType).to.equal(orderType);
    });

    it('resolves to-n-then-to-n relations', () => {
        const path = new CollectPath({ path: 'shipments.handlingUnits' }, deliveryType);
        const shipmentsField = deliveryType.getFieldOrThrow('shipments');
        const handlingUnitsField = shipmentType.getFieldOrThrow('handlingUnits');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: shipmentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: shipmentsField,
                relationSide: shipmentsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: true, // shipments->handling units is m:n
                minDepth: 1,
                maxDepth: 1,
                field: handlingUnitsField,
                relationSide: handlingUnitsField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(handlingUnitType);
    });

    it('resolves to-1-then-to-n relations', () => {
        const path = new CollectPath({ path: 'order.handlingUnits' }, deliveryType);
        const orderField = deliveryType.getFieldOrThrow('order');
        const handlingUnitsField = orderType.getFieldOrThrow('handlingUnits');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: orderType,
                isListSegment: false,
                resultIsList: false,
                isNullableSegment: true,
                resultIsNullable: true,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: orderField,
                relationSide: orderField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: handlingUnitsField,
                relationSide: handlingUnitsField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(handlingUnitType);
    });

    it('resolves to-n-then-1-to-1 relations', () => {
        const path = new CollectPath({ path: 'shipments.purchaseOrder' }, deliveryType);
        const shipmentsField = deliveryType.getFieldOrThrow('shipments');
        const purchaseOrderField = shipmentType.getFieldOrThrow('purchaseOrder');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: shipmentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: shipmentsField,
                relationSide: shipmentsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: purchaseOrderType,
                isListSegment: false,
                resultIsList: true,
                isNullableSegment: true,
                resultIsNullable: true,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: purchaseOrderField,
                relationSide: purchaseOrderField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(purchaseOrderType);
        expect(path.resultIsList).to.equal(true);
    });

    it('resolves to-n-then-n-to-1 relations', () => {
        const path = new CollectPath({ path: 'shipments.order' }, deliveryType);
        const shipmentsField = deliveryType.getFieldOrThrow('shipments');
        const orderField = shipmentType.getFieldOrThrow('order');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: shipmentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: shipmentsField,
                relationSide: shipmentsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: orderType,
                isListSegment: false,
                resultIsList: true,
                isNullableSegment: true,
                resultIsNullable: true,
                resultMayContainDuplicateEntities: true, // this here actually differs from the previous test
                minDepth: 1,
                maxDepth: 1,
                field: orderField,
                relationSide: orderField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(orderType);
        expect(path.resultIsList).to.equal(true);
    });

    it('resolves to-1-then-to-1 relations', () => {
        const path = new CollectPath({ path: 'order.delivery' }, deliveryType);
        const orderField = deliveryType.getFieldOrThrow('order');
        const deliveryField = orderType.getFieldOrThrow('delivery');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: orderType,
                isListSegment: false,
                resultIsList: false,
                isNullableSegment: true,
                resultIsNullable: true,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: orderField,
                relationSide: orderField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: deliveryType,
                isListSegment: false,
                resultIsList: false,
                isNullableSegment: true,
                resultIsNullable: true,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: deliveryField,
                relationSide: deliveryField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(deliveryType);
        expect(path.resultIsList).to.equal(false);
    });

    it('resolves recursive relations', () => {
        const path = new CollectPath(
            { path: 'handlingUnits.childHandlingUnits.childHandlingUnits' },
            deliveryType,
        );
        const handlingUnitsField = deliveryType.getFieldOrThrow('handlingUnits');
        const childHandlingUnitsField = handlingUnitType.getFieldOrThrow('childHandlingUnits');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: handlingUnitsField,
                relationSide: handlingUnitsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false, // childHandlingUnits is a 1-to-n relation
                minDepth: 1,
                maxDepth: 1,
                field: childHandlingUnitsField,
                relationSide: childHandlingUnitsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: childHandlingUnitsField,
                relationSide: childHandlingUnitsField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(handlingUnitType);
    });

    it('resolves relations with exact depth specifier', () => {
        const path = new CollectPath({ path: 'handlingUnits.childHandlingUnits{2}' }, deliveryType);
        const handlingUnitsField = deliveryType.getFieldOrThrow('handlingUnits');
        const childHandlingUnitsField = handlingUnitType.getFieldOrThrow('childHandlingUnits');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: handlingUnitsField,
                relationSide: handlingUnitsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 2,
                maxDepth: 2,
                field: childHandlingUnitsField,
                relationSide: childHandlingUnitsField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(handlingUnitType);
    });

    it('resolves relations with min and max depth specifier', () => {
        const path = new CollectPath(
            { path: 'handlingUnits.childHandlingUnits{2,4}' },
            deliveryType,
        );
        const handlingUnitsField = deliveryType.getFieldOrThrow('handlingUnits');
        const childHandlingUnitsField = handlingUnitType.getFieldOrThrow('childHandlingUnits');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: handlingUnitsField,
                relationSide: handlingUnitsField.getRelationSideOrThrow(),
            },
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 2,
                maxDepth: 4,
                field: childHandlingUnitsField,
                relationSide: childHandlingUnitsField.getRelationSideOrThrow(),
            },
        ] as const);
        expect(path.resultingType).to.equal(handlingUnitType);
    });

    it('resolves direct child entities', () => {
        const path = new CollectPath({ path: 'items' }, deliveryType);
        const itemsField = deliveryType.getFieldOrThrow('items');
        assertSegmentsEqual(path, [
            {
                kind: 'field',
                resultingType: itemType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: itemsField,
            },
        ] as const);
        expect(path.resultingType).to.equal(itemType);
    });

    it('resolves indirect child entities', () => {
        const path = new CollectPath({ path: 'contents.items' }, deliveryType);
        const contentsField = deliveryType.getFieldOrThrow('contents');
        const itemsField = deliveryContentType.getFieldOrThrow('items');
        assertSegmentsEqual(path, [
            {
                kind: 'field',
                resultingType: deliveryContentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: contentsField,
            },
            {
                kind: 'field',
                resultingType: itemType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: itemsField,
            },
        ] as const);
        expect(path.resultingType).to.equal(itemType);
    });

    it('resolves child entities of entity extensions', () => {
        const path = new CollectPath({ path: 'dangerousGoodsInfo.dangerousItems' }, deliveryType);
        const dangerousGoodsField = deliveryType.getFieldOrThrow('dangerousGoodsInfo');
        const itemsField = dangerousGoodsInfoType.getFieldOrThrow('dangerousItems');
        assertSegmentsEqual(path, [
            {
                kind: 'field',
                resultingType: dangerousGoodsInfoType,
                isListSegment: false,
                resultIsList: false,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: dangerousGoodsField,
            },
            {
                kind: 'field',
                resultingType: itemType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: itemsField,
            },
        ] as const);
        expect(path.resultingType).to.equal(itemType);
    });

    it('resolves recursive child entities', () => {
        const path = new CollectPath({ path: 'contents.subContents.subContents' }, deliveryType);
        const contentsField = deliveryType.getFieldOrThrow('contents');
        const subContentsField = deliveryContentType.getFieldOrThrow('subContents');
        assertSegmentsEqual(path, [
            {
                kind: 'field',
                resultingType: deliveryContentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: contentsField,
            },
            {
                kind: 'field',
                resultingType: deliveryContentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: subContentsField,
            },
            {
                kind: 'field',
                resultingType: deliveryContentType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: subContentsField,
            },
        ] as const);
        expect(path.resultingType).to.equal(deliveryContentType);
    });

    it('resolves child entities of relations', () => {
        const path = new CollectPath({ path: 'handlingUnits.items' }, deliveryType);
        const handlingUnitsField = deliveryType.getFieldOrThrow('handlingUnits');
        const itemsField = handlingUnitType.getFieldOrThrow('items');
        assertSegmentsEqual(path, [
            {
                kind: 'relation',
                resultingType: handlingUnitType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                minDepth: 1,
                maxDepth: 1,
                field: handlingUnitsField,
                relationSide: handlingUnitsField.getRelationSideOrThrow(),
            },
            {
                kind: 'field',
                resultingType: itemType,
                isListSegment: true,
                resultIsList: true,
                isNullableSegment: false,
                resultIsNullable: false,
                resultMayContainDuplicateEntities: false,
                field: itemsField,
            },
        ] as const);
        expect(path.resultingType).to.equal(itemType);
    });
});
