import { describe, expect, it } from 'vitest';
import { Project } from '../../core/project/project.js';
import { ProjectSource } from '../../core/project/source.js';
import { InMemoryAdapter } from '../../inmemory/inmemory-adapter.js';

/**
 * A project that combines the schema patterns that are commonly used in real projects, to make sure
 * they keep validating without errors or warnings
 */
const schema = `
enum DeliveryStatus {
    DRAFT
    PROCESSING
    DELIVERED
}

enum CreationKind {
    APP
    API
}

"A delivery of goods"
type Delivery
    @rootEntity(
        permissionProfile: "restricted"
        flexSearch: true
        flexSearchLanguage: DE
        flexSearchOrder: [{ field: "deliveryNumber", direction: DESC }]
        flexSearchPerformanceParams: { commitIntervalMsec: 1000 }
        indices: [{ fields: ["deliveryNumber"], unique: true }, { fields: ["status", "createdAt"] }]
    )
    @businessObject {
    deliveryNumber: String @key @flexSearch(caseSensitive: true, includeInSearch: true)
    status: DeliveryStatus @defaultValue(value: DRAFT) @flexSearch @suppress(infos: NO_TYPE_CHECKS)
    isCanceled: Boolean @defaultValue(value: false) @flexSearch @suppress(infos: NO_TYPE_CHECKS)
    isExpress: Boolean @defaultValue(value: true) @suppress(infos: NO_TYPE_CHECKS)
    priority: Int @defaultValue(value: 2) @suppress(infos: NO_TYPE_CHECKS)
    remarks: String @defaultValue(value: "none") @flexSearchFulltext(language: DE) @suppress(infos: NO_TYPE_CHECKS)
    description: String @flexSearchFulltext(includeInSearch: true, language: EN)
    customerName: String @flexSearch(caseSensitive: false)
    internalNote: String @flexSearch(includeInSearch: false)
    "deprecated without a reason"
    oldNote: String @deprecated
    legacyNumber: String @deprecated(reason: "Use deliveryNumber instead")
    accessGroup: String @accessField @flexSearch
    totalWeightInKg: Decimal3 @calcMutations(operators: [ADD, SUBTRACT])
    numberOfPackages: Int @calcMutations(operators: [ADD])
    externalId: ID @flexSearch
    serialNumber: Int53
    netValue: Decimal2
    grossValue: Decimal1
    volumeInCubicMeters: Float
    dispatchDate: LocalDate
    dispatchTime: LocalTime
    pickupTimes: [LocalTime]
    holidays: [LocalDate]
    plannedArrival: OffsetDateTime
    arrival: DateTime
    title: I18nString
    titles: [I18nString]
    customData: JSON
    customObject: JSONObject
    labels: StringMap
    measurements: [Float]
    quantities: [Int]
    tags: [String]
    completion: TrackedFlag @defaultValue(value: { value: false }) @suppress(infos: NO_TYPE_CHECKS)
    weight: AmountWithUnit @defaultValue(value: { amount: 0, unit: "kg" }) @suppress(infos: NO_TYPE_CHECKS)
    consignee: Address @flexSearch(includeInSearch: true)
    processing: ProcessingInfo
    items: [DeliveryItem]
    handlingUnits: [HandlingUnit] @relation
    shipment: Shipment @relation(inverseOf: "deliveries")
    forwarder: Forwarder @reference(keyField: "forwarderKey")
    forwarderKey: String
    numberOfItems: Int @collect(path: "items", aggregate: COUNT)
    containsDangerousGoods: Boolean @collect(path: "items.isDangerousGoods", aggregate: SOME_TRUE)
    isCompletelyPacked: Boolean @collect(path: "items.isPacked", aggregate: EVERY_TRUE)
    numberOfUnpackedItems: Int @collect(path: "items.isPacked", aggregate: COUNT_NOT_TRUE)
    numberOfPackedItems: Int @collect(path: "items.isPacked", aggregate: COUNT_TRUE)
    hasItemsWithoutQuantity: Boolean @collect(path: "items.quantity", aggregate: SOME_NULL)
    numberOfItemsWithQuantity: Int @collect(path: "items.quantity", aggregate: COUNT_NOT_NULL)
    hasItems: Boolean @collect(path: "items", aggregate: SOME)
    totalQuantity: Int @collect(path: "items.quantity", aggregate: SUM)
    minQuantity: Int @collect(path: "items.quantity", aggregate: MIN)
    maxQuantity: Int @collect(path: "items.quantity", aggregate: MAX)
    articleNumbers: [String] @collect(path: "items.articleNumber", aggregate: DISTINCT)
    handlingUnitNumbers: [String]
        @collect(path: "handlingUnits.handlingUnitNumber", aggregate: DISTINCT)
}

type HandlingUnit
    @rootEntity(
        permissionProfile: "restricted"
        flexSearch: true
        flexSearchOrder: { field: "handlingUnitNumber", direction: ASC }
        indices: [{ fields: ["handlingUnitNumber"], sparse: true }, { id: "byDelivery", fields: ["deliveryNumber"] }]
    )
    @businessObject {
    handlingUnitNumber: String @unique @flexSearch
    deliveryNumber: String @index
    accessGroup: String @accessField @flexSearch
    delivery: Delivery @relation(inverseOf: "handlingUnits")
    packages: [Package] @relation(onDelete: CASCADE)
}

type Package @rootEntity(permissionProfile: "restricted", indices: []) {
    packageNumber: String @key
    accessGroup: String @accessField
    handlingUnit: HandlingUnit @relation(inverseOf: "packages")
}

type Shipment @rootEntity(indices: [{ fields: ["shipmentNumber"], unique: true, sparse: true }]) {
    shipmentNumber: String
    deliveries: [Delivery] @relation(onDelete: REMOVE_EDGES)
    allHandlingUnits: [HandlingUnit] @collect(path: "deliveries.handlingUnits")
}

type Forwarder @rootEntity @roles(read: ["logistics"], readWrite: ["admin"]) {
    forwarderKey: String @key
    name: String
}

type DeliveryItem @childEntity {
    articleNumber: String
    quantity: Int
    isPacked: Boolean
    isDangerousGoods: Boolean
    delivery: Delivery @root
}

type ProcessingInfo @entityExtension {
    createdBy: CreationInfo
    comment: String
}

type CreationInfo @valueObject {
    kind: CreationKind
    userName: String
}

type Address @valueObject(flexSearchLanguage: DE) {
    street: String @flexSearchFulltext(includeInSearch: true)
    city: String @flexSearch(includeInSearch: true)
}

type AmountWithUnit @valueObject {
    amount: Decimal3
    unit: String
}

type TrackedFlag @valueObject {
    value: Boolean
    changedAt: DateTime
}

"Kept for older clients"
type ArchivedNote @valueObject @suppress(warnings: UNUSED) {
    text: String
}

type LegacyRecord @rootEntity @suppress(compatibilityIssues: [FIELD_TYPE, TYPE_KIND]) {
    amount: Float @suppress(compatibilityIssues: FIELD_TYPE)
}
`;

const permissionProfiles = JSON.stringify({
    permissionProfiles: {
        default: {
            permissions: [{ roles: ['admin'], access: 'readWrite' }],
        },
        restricted: {
            permissions: [
                { roles: ['admin'], access: 'readWrite' },
                {
                    roles: ['logistics'],
                    access: 'read',
                    restrictToAccessGroups: ['logistics'],
                },
                {
                    roles: ['/^forwarder-(.+)$/'],
                    access: ['read', 'update'],
                    restrictToAccessGroups: ['forwarded-by-$1'],
                },
                {
                    roles: ['customer'],
                    access: 'read',
                    restrictions: [{ field: 'accessGroup', claim: 'accessGroups' }],
                },
            ],
        },
    },
});

const i18n = `i18n:
  de:
    fields:
      accessGroup: Berechtigungsgruppe
      createdAt: Angelegt am

    types:
      Delivery:
        label: Lieferung
        labelPlural: Lieferungen
        fields:
          deliveryNumber: Liefernummer
          status:
            label: Status
            hint: Der Bearbeitungsstatus

      DeliveryStatus:
        label: Status
        values:
          DRAFT: Entwurf
          DELIVERED: Zugestellt
  en:
    types:
      Delivery:
        label: Delivery
        labelPlural: Deliveries
`;

const billing = JSON.stringify({
    billing: {
        billingEntities: [
            { typeName: 'Delivery', keyFieldName: 'deliveryNumber' },
            { typeName: 'Package' },
            {
                typeName: 'HandlingUnit',
                keyFieldName: 'handlingUnitNumber',
                quantityFieldName: 'packages',
                categoryMapping: {
                    fieldName: 'delivery.processing.createdBy.kind',
                    defaultValue: 'standard',
                    values: { APP: 'standard', API: 'automated' },
                },
            },
        ],
    },
});

const timeToLive = `timeToLive:
  - typeName: Shipment
    dateField: updatedAt
    expireAfterDays: 30
  - typeName: Delivery
    dateField: arrival
    expireAfterDays: 90
    cascadeFields:
      - handlingUnits
`;

describe('common schema patterns', () => {
    it('validates without errors and warnings', () => {
        const project = new Project([
            new ProjectSource('schema.graphqls', schema),
            new ProjectSource('permission-profiles.json', permissionProfiles),
            new ProjectSource('i18n.yaml', i18n),
            new ProjectSource('billing.json', billing),
            new ProjectSource('ttl.yaml', timeToLive),
        ]);
        const messages = project
            .validate()
            .messages.filter((m) => !m.isSuppressed)
            .map((m) => `${m.severity}: ${m.message} (${m.location?.sourceName})`);
        expect(messages).to.deep.equal([]);
    });

    it('creates a schema', () => {
        const project = new Project([
            new ProjectSource('schema.graphqls', schema),
            new ProjectSource('permission-profiles.json', permissionProfiles),
            new ProjectSource('i18n.yaml', i18n),
            new ProjectSource('billing.json', billing),
            new ProjectSource('ttl.yaml', timeToLive),
        ]);
        expect(() => project.createSchema(new InMemoryAdapter())).not.to.throw();
    });
});
