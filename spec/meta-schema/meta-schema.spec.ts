import { expect } from 'chai';
import { DocumentNode, graphql, print } from 'graphql';
import gql from 'graphql-tag';
import { getMetaSchema } from '../../src/meta-schema/meta-schema';
import { AggregationOperator, Model, TypeKind } from '../../src/model';
import { stopMetaServer } from '../dev/server';

describe('Meta schema API', () => {
    const introQuery = gql`
        query {
            __schema {
                types {
                    name
                    kind
                }
            }
        }
    `;
    const typeQuery = gql`
        {
            types {
                name
                kind
                ... on ObjectType {
                    fields {
                        name
                        isList
                        isReference
                        referenceKeyField {
                            name
                        }
                        isRelation
                        isCollectField
                        collectFieldConfig {
                            path
                            fieldsInPath {
                                name
                                declaringType {
                                    name
                                }
                            }
                            aggregationOperator
                        }
                        type {
                            __typename
                        }
                    }
                }
                ... on RootEntityType {
                    pluralName
                    keyField {
                        name
                    }
                    isBusinessObject
                }
                ... on EnumType {
                    values {
                        value
                    }
                }
            }
        }
    `;

    const queryPerTypeQuery = gql`
        {
            rootEntityTypes {
                name
            }
            childEntityTypes {
                name
            }
            entityExtensionTypes {
                name
            }
            valueObjectTypes {
                name
            }
            scalarTypes {
                name
            }
            enumTypes {
                name
            }
        }
    `;

    const relationQuery = gql`
        {
            rootEntityType(name: "Delivery") {
                name
                relations {
                    fromField {
                        name
                    }
                    fromType {
                        name
                    }
                    toField {
                        name
                    }
                    toType {
                        name
                    }
                }
            }
        }
    `;

    const enumQuery = gql`
        {
            enumType(name: "TransportKind") {
                name
                values {
                    value
                }
            }
        }
    `;

    const localizationQuery = gql`
        {
            valueObjectType(name: "Address") {
                localization {
                    label
                    labelPlural
                    hint
                }
                fields {
                    name
                    localization {
                        label
                        hint
                    }
                }
            }
        }
    `;

    const model = new Model({
        types: [
            {
                name: 'Address',
                kind: TypeKind.VALUE_OBJECT,
                fields: [
                    {
                        name: 'street',
                        typeName: 'String'
                    }
                ]
            },
            {
                name: 'Country',
                kind: TypeKind.ROOT_ENTITY,
                keyFieldName: 'isoCode',
                fields: [
                    {
                        name: 'isoCode',
                        typeName: 'String'
                    }
                ],
                namespacePath: ['generic']
            },
            {
                name: 'Shipment',
                kind: TypeKind.ROOT_ENTITY,
                isBusinessObject: true,
                fields: [
                    {
                        name: 'deliveries',
                        typeName: 'Delivery',
                        isList: true,
                        isRelation: true
                    },
                    {
                        name: 'delivery',
                        typeName: 'Delivery',
                        isRelation: true
                    },
                    {
                        name: 'deliveryNonRelation',
                        typeName: 'Delivery'
                    },
                    {
                        name: 'deliveryWithInverseOf',
                        typeName: 'Delivery',
                        isRelation: true,
                        inverseOfFieldName: 'shipment'
                    },
                    {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isRelation: true,
                        isList: true
                    },
                    {
                        name: 'transportKind',
                        typeName: 'TransportKind'
                    },
                    {
                        name: 'totalWeightInKg',
                        typeName: 'Int',
                        collect: {
                            path: 'deliveries.weightInKg',
                            aggregationOperator: AggregationOperator.SUM
                        }
                    },
                    {
                        name: 'destinationCountry',
                        typeName: 'Country',
                        isReference: true
                    }
                ],
                namespacePath: ['logistics', 'shipments']
            },
            {
                name: 'Delivery',
                kind: TypeKind.ROOT_ENTITY,
                isBusinessObject: true,
                fields: [
                    {
                        name: 'shipment',
                        typeName: 'Shipment',
                        isRelation: true
                    },
                    {
                        name: 'weightInKg',
                        typeName: 'Int'
                    },
                    {
                        name: 'countryOfOriginIsoCode',
                        typeName: 'String'
                    },
                    {
                        name: 'countryOfOrigin',
                        typeName: 'Country',
                        isReference: true,
                        referenceKeyField: 'countryOfOriginIsoCode'
                    }
                ],
                namespacePath: ['logistics']
            },
            {
                name: 'HandlingUnit',
                kind: TypeKind.ROOT_ENTITY,
                fields: []
            },
            {
                name: 'Item',
                kind: TypeKind.CHILD_ENTITY,
                fields: []
            },
            {
                name: 'DangerousGoodsInfo',
                kind: TypeKind.ENTITY_EXTENSION,
                fields: []
            },
            {
                name: 'TransportKind',
                kind: TypeKind.ENUM,
                values: [{ value: 'AIR' }, { value: 'ROAD' }, { value: 'SEA' }]
            }
        ],
        permissionProfiles: [
            {
                profiles: {
                    default: {
                        permissions: [
                            {
                                roles: ['accounting'],
                                access: 'readWrite'
                            }
                        ]
                    },
                    accounting: {
                        permissions: [
                            {
                                roles: ['accounting'],
                                access: 'readWrite'
                            }
                        ]
                    }
                }
            }
        ],
        i18n: [
            {
                language: 'de',
                namespacePath: [],
                types: {
                    Address: {
                        label: 'Adresse',
                        labelPlural: 'Adressen',
                        hint: 'Eine Adresse',
                        fields: {
                            street: {
                                label: 'Straße'
                            }
                        }
                    }
                }
            },
            {
                language: 'en',
                namespacePath: [],
                types: {
                    Address: {
                        fields: {
                            street: {
                                hint: 'The street and number'
                            }
                        }
                    }
                }
            }
        ]
    });

    const metaSchema = getMetaSchema(model);

    async function execute(doc: DocumentNode, context?: any) {
        const { data, errors } = await graphql(metaSchema, print(doc), {}, context);
        if (errors) {
            throw new Error(JSON.stringify(errors));
        }
        return data;
    }

    it('can query over all types', async () => {
        const result = await execute(typeQuery);
        expect(result).to.deep.equal({
            types: [
                { name: 'ID', kind: 'SCALAR' },
                { name: 'String', kind: 'SCALAR' },
                { name: 'Boolean', kind: 'SCALAR' },
                { name: 'Int', kind: 'SCALAR' },
                { name: 'Float', kind: 'SCALAR' },
                { name: 'JSON', kind: 'SCALAR' },
                { name: 'JSONObject', kind: 'SCALAR' },
                { name: 'StringMap', kind: 'SCALAR' },
                { name: 'I18nString', kind: 'SCALAR' },
                { name: 'DateTime', kind: 'SCALAR' },
                { name: 'LocalDate', kind: 'SCALAR' },
                { name: 'LocalTime', kind: 'SCALAR' },
                { name: 'OffsetDateTime', kind: 'SCALAR' },
                {
                    name: 'Address',
                    kind: 'VALUE_OBJECT',
                    fields: [
                        {
                            name: 'street',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        }
                    ]
                },
                {
                    name: 'Country',
                    pluralName: 'Countries',
                    kind: 'ROOT_ENTITY',
                    keyField: { name: 'isoCode' },
                    isBusinessObject: false,
                    fields: [
                        {
                            name: 'id',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'isoCode',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        }
                    ]
                },
                {
                    name: 'Shipment',
                    pluralName: 'Shipments',
                    kind: 'ROOT_ENTITY',
                    keyField: null,
                    isBusinessObject: true,
                    fields: [
                        {
                            name: 'id',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'deliveries',
                            isList: true,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' }
                        },
                        {
                            name: 'delivery',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' }
                        },
                        {
                            name: 'deliveryNonRelation',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' }
                        },
                        {
                            name: 'deliveryWithInverseOf',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' }
                        },
                        {
                            name: 'handlingUnits',
                            isList: true,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' }
                        },
                        {
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            name: 'transportKind',
                            type: { __typename: 'EnumType' }
                        },
                        {
                            name: 'totalWeightInKg',
                            collectFieldConfig: {
                                aggregationOperator: 'SUM',
                                fieldsInPath: [
                                    { declaringType: { name: 'Shipment' }, name: 'deliveries' },
                                    { declaringType: { name: 'Delivery' }, name: 'weightInKg' }
                                ],
                                path: ['deliveries', 'weightInKg']
                            },
                            isCollectField: true,
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            type: {
                                __typename: 'ScalarType'
                            }
                        },
                        {
                            name: 'destinationCountry',
                            collectFieldConfig: null,
                            isCollectField: false,
                            isList: false,
                            isReference: true,
                            isRelation: false,
                            referenceKeyField: {
                                name: 'destinationCountry'
                            },
                            type: {
                                __typename: 'RootEntityType'
                            }
                        }
                    ]
                },
                {
                    name: 'Delivery',
                    pluralName: 'Deliveries',
                    kind: 'ROOT_ENTITY',
                    keyField: null,
                    isBusinessObject: true,
                    fields: [
                        {
                            name: 'id',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'shipment',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' }
                        },
                        {
                            name: 'weightInKg',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'countryOfOriginIsoCode',
                            collectFieldConfig: null,
                            isCollectField: false,
                            isList: false,
                            isReference: false,
                            isRelation: false,
                            referenceKeyField: null,
                            type: {
                                __typename: 'ScalarType'
                            }
                        },
                        {
                            collectFieldConfig: null,
                            isCollectField: false,
                            isList: false,
                            isReference: true,
                            isRelation: false,
                            name: 'countryOfOrigin',
                            referenceKeyField: {
                                name: 'countryOfOriginIsoCode'
                            },
                            type: {
                                __typename: 'RootEntityType'
                            }
                        }
                    ]
                },
                {
                    name: 'HandlingUnit',
                    pluralName: 'HandlingUnits',
                    kind: 'ROOT_ENTITY',
                    keyField: null,
                    isBusinessObject: false,
                    fields: [
                        {
                            name: 'id',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        }
                    ]
                },
                {
                    name: 'Item',
                    kind: 'CHILD_ENTITY',
                    fields: [
                        {
                            name: 'id',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' }
                        }
                    ]
                },
                { name: 'DangerousGoodsInfo', kind: 'ENTITY_EXTENSION', fields: [] },
                {
                    name: 'TransportKind',
                    kind: 'ENUM',
                    values: [{ value: 'AIR' }, { value: 'ROAD' }, { value: 'SEA' }]
                }
            ]
        });
    });

    it('can query single types', async () => {
        const result = await execute(queryPerTypeQuery);
        expect(result).to.deep.equal({
            rootEntityTypes: [
                { name: 'Country' },
                { name: 'Shipment' },
                { name: 'Delivery' },
                { name: 'HandlingUnit' }
            ],
            childEntityTypes: [{ name: 'Item' }],
            entityExtensionTypes: [{ name: 'DangerousGoodsInfo' }],
            valueObjectTypes: [{ name: 'Address' }],
            scalarTypes: [
                { name: 'ID' },
                { name: 'String' },
                { name: 'Boolean' },
                { name: 'Int' },
                { name: 'Float' },
                { name: 'JSON' },
                { name: 'JSONObject' },
                { name: 'StringMap' },
                { name: 'I18nString' },
                { name: 'DateTime' },
                { name: 'LocalDate' },
                { name: 'LocalTime' },
                { name: 'OffsetDateTime' }
            ],
            enumTypes: [{ name: 'TransportKind' }]
        });
    });

    it('can query relations', async () => {
        const result = await execute(relationQuery);
        expect(result).to.deep.equal({
            rootEntityType: {
                name: 'Delivery',
                relations: [
                    {
                        fromField: { name: 'deliveries' },
                        fromType: { name: 'Shipment' },
                        toField: null,
                        toType: { name: 'Delivery' }
                    },
                    {
                        fromField: { name: 'delivery' },
                        fromType: { name: 'Shipment' },
                        toField: null,
                        toType: { name: 'Delivery' }
                    },
                    {
                        fromField: { name: 'shipment' },
                        fromType: { name: 'Delivery' },
                        toField: { name: 'deliveryWithInverseOf' },
                        toType: { name: 'Shipment' }
                    }
                ]
            }
        });
    });

    it('can query namespaces', async () => {
        const result = await execute(
            gql`
                {
                    namespaces {
                        name
                        path
                        isRoot
                    }
                }
            `
        );
        expect(result).to.deep.equal({
            namespaces: [
                { name: null, path: [], isRoot: true },
                { name: 'generic', path: ['generic'], isRoot: false },
                { name: 'logistics', path: ['logistics'], isRoot: false },
                { name: 'shipments', path: ['logistics', 'shipments'], isRoot: false }
            ]
        });
    });

    it('can query namespace by path', async () => {
        const result = await execute(
            gql`
                {
                    logistics: namespace(path: ["logistics"]) {
                        name
                        path
                    }
                    root: namespace(path: []) {
                        name
                        path
                    }
                }
            `
        );
        expect(result).to.deep.equal({
            logistics: { name: 'logistics', path: ['logistics'] },
            root: { name: null, path: [] }
        });
    });

    it('can query enum values', async () => {
        const result = await execute(enumQuery);
        expect(result).to.deep.equal({
            enumType: {
                name: 'TransportKind',
                values: [
                    {
                        value: 'AIR'
                    },
                    {
                        value: 'ROAD'
                    },
                    {
                        value: 'SEA'
                    }
                ]
            }
        });
    });

    it('can query localization with generic provider', async () => {
        const result = await execute(localizationQuery);
        const addressType = result!.valueObjectType;
        expect(addressType.localization).to.deep.equal({
            label: 'Address',
            labelPlural: 'Addresses',
            hint: null
        });
        const streetField = addressType.fields.find((f: any) => f.name === 'street');
        expect(streetField.localization).to.deep.equal({
            label: 'Street',
            hint: null
        });
    });

    it('can query localization with provided language', async () => {
        const result = await execute(localizationQuery, { locale: ['de', 'en'] });
        const addressType = result!.valueObjectType;
        expect(addressType.localization).to.deep.equal({
            label: 'Adresse',
            labelPlural: 'Adressen',
            hint: 'Eine Adresse'
        });
        const streetField = addressType.fields.find((f: any) => f.name === 'street');
        expect(streetField.localization).to.deep.equal({
            label: 'Straße',
            hint: 'The street and number'
        });
    });

    after(function() {
        return stopMetaServer();
    });
});
