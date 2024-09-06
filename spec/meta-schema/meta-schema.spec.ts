import { expect } from 'chai';
import { DocumentNode, graphql, print } from 'graphql';
import gql from 'graphql-tag';
import { CRUDDL_VERSION } from '../../src/cruddl-version';
import {
    ExecutionOptions,
    ExecutionOptionsCallbackArgs,
} from '../../src/execution/execution-options';
import { getMetaSchema } from '../../src/meta-schema/meta-schema';
import { AggregationOperator, Model, TypeKind } from '../../src/model';
import { Project } from '../../src/project/project';
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

    const rawI18nQuery = gql`
        {
            rootEntityType(name: "Shipment") {
                label
                labelPlural
                hint
                fields {
                    name
                    label
                    hint
                }
            }
            enumType(name: "TransportKind") {
                label
                labelPlural
                hint
                values {
                    value
                    label
                    hint
                }
            }
            valueObjectType(name: "Address") {
                label
                labelPlural
                hint
            }
        }
    `;

    const hiddenFieldsQuery = gql`
        {
            rootEntityType(name: "Country") {
                fields {
                    name
                    isHidden
                }
            }
        }
    `;

    const permissionsQuery = gql`
        {
            rootEntityType(name: "Shipment") {
                permissions {
                    canRead
                    canCreate
                    canUpdate
                    canDelete
                }
                fields {
                    name
                    permissions {
                        canRead
                        canWrite
                    }
                }
            }
        }
    `;

    const cruddlVersionQuery = gql`
        {
            cruddlVersion
        }
    `;

    const cruddlVersionIntrospectionQuery = gql`
        {
            __type(name: "Query") {
                description
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
                        typeName: 'String',
                    },
                ],
            },
            {
                name: 'Country',
                kind: TypeKind.ROOT_ENTITY,
                keyFieldName: 'isoCode',
                fields: [
                    {
                        name: 'isoCode',
                        typeName: 'String',
                        isHidden: true,
                    },
                    {
                        name: 'id',
                        typeName: 'ID',
                        isHidden: true,
                    },
                    {
                        name: 'dummy',
                        typeName: 'String',
                    },
                ],
                namespacePath: ['generic'],
            },
            {
                name: 'Shipment',
                kind: TypeKind.ROOT_ENTITY,
                isBusinessObject: true,
                permissions: {
                    roles: {
                        read: ['user', 'admin'],
                        readWrite: ['admin'],
                    },
                },
                fields: [
                    {
                        name: 'deliveries',
                        typeName: 'Delivery',
                        isList: true,
                        isRelation: true,
                    },
                    {
                        name: 'delivery',
                        typeName: 'Delivery',
                        isRelation: true,
                    },
                    {
                        name: 'deliveryNonRelation',
                        typeName: 'Delivery',
                    },
                    {
                        name: 'deliveryWithInverseOf',
                        typeName: 'Delivery',
                        isRelation: true,
                        inverseOfFieldName: 'shipment',
                    },
                    {
                        name: 'handlingUnits',
                        typeName: 'HandlingUnit',
                        isRelation: true,
                        isList: true,
                    },
                    {
                        name: 'transportKind',
                        typeName: 'TransportKind',
                        permissions: {
                            roles: {
                                read: ['admin'],
                            },
                        },
                    },
                    {
                        name: 'totalWeightInKg',
                        typeName: 'Int',
                        collect: {
                            path: 'deliveries.weightInKg',
                            aggregationOperator: AggregationOperator.SUM,
                        },
                    },
                    {
                        name: 'destinationCountry',
                        typeName: 'Country',
                        isReference: true,
                    },
                ],
                namespacePath: ['logistics', 'shipments'],
            },
            {
                name: 'Delivery',
                kind: TypeKind.ROOT_ENTITY,
                isBusinessObject: true,
                fields: [
                    {
                        name: 'shipment',
                        typeName: 'Shipment',
                        isRelation: true,
                    },
                    {
                        name: 'weightInKg',
                        typeName: 'Int',
                    },
                    {
                        name: 'countryOfOriginIsoCode',
                        typeName: 'String',
                    },
                    {
                        name: 'countryOfOrigin',
                        typeName: 'Country',
                        isReference: true,
                        referenceKeyField: 'countryOfOriginIsoCode',
                    },
                ],
                namespacePath: ['logistics'],
            },
            {
                name: 'HandlingUnit',
                kind: TypeKind.ROOT_ENTITY,
                fields: [],
            },
            {
                name: 'Item',
                kind: TypeKind.CHILD_ENTITY,
                fields: [],
            },
            {
                name: 'DangerousGoodsInfo',
                kind: TypeKind.ENTITY_EXTENSION,
                fields: [],
            },
            {
                name: 'TransportKind',
                kind: TypeKind.ENUM,
                values: [{ value: 'AIR' }, { value: 'ROAD' }, { value: 'SEA' }],
            },
        ],
        permissionProfiles: [
            {
                profiles: {
                    default: {
                        permissions: [
                            {
                                roles: ['accounting'],
                                access: 'readWrite',
                            },
                        ],
                    },
                    accounting: {
                        permissions: [
                            {
                                roles: ['accounting'],
                                access: 'readWrite',
                            },
                        ],
                    },
                },
            },
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
                                label: 'Straße',
                            },
                        },
                    },
                    Shipment: {
                        label: 'Lieferung',
                        labelPlural: 'Lieferungen',
                        hint: 'Eine Lieferung',
                        fields: {
                            transportKind: {
                                label: 'Transportart',
                                hint: 'Transportart der Lieferung',
                            },
                            handlingUnits: {
                                label: 'Packstücke',
                                hint: 'Die Packstücke der Lieferung',
                            },
                        },
                    },
                    TransportKind: {
                        label: 'Transportart',
                        labelPlural: 'Transportarten',
                        hint: 'Die Art des Transports',
                        values: {
                            AIR: {
                                label: 'Luft',
                                hint: 'Lieferung mittels Fluchtfracht',
                            },
                            ROAD: {
                                label: 'Straße',
                                hint: 'Lieferung mittels LKW',
                            },
                            SEA: {
                                label: 'Übersee',
                                hint: 'Lieferung mittels Schiff',
                            },
                        },
                    },
                },
            },
            {
                language: 'en',
                namespacePath: [],
                types: {
                    Address: {
                        fields: {
                            street: {
                                hint: 'The street and number',
                            },
                        },
                    },
                    Shipment: {
                        label: 'Shipment',
                        labelPlural: 'Shipments',
                        hint: 'A shipment',
                        fields: {
                            transportKind: {
                                label: 'Transport kind',
                                hint: 'The kind of transport for the shipment',
                            },
                        },
                    },
                    TransportKind: {
                        label: 'Transport kind',
                        labelPlural: 'Transport kinds',
                        hint: 'The kind of transport',
                        values: {
                            AIR: {
                                label: 'Air',
                                hint: 'Delivery via airfreight',
                            },
                            ROAD: {
                                label: 'Road',
                                hint: 'Delivery via truck',
                            },
                            SEA: {
                                label: 'Sea',
                                hint: 'Delivery via ship',
                            },
                        },
                    },
                },
            },
        ],
    });

    const project = {
        getModel: () => model,
        options: {
            getExecutionOptions: ({ context }: ExecutionOptionsCallbackArgs): ExecutionOptions => ({
                locale: {
                    acceptLanguages: context?.locale,
                },
                authContext: { authRoles: context?.authRoles },
            }),
        },
    } as any as Project;

    const metaSchema = getMetaSchema(project);

    async function execute(doc: DocumentNode, contextValue?: unknown) {
        const { data, errors } = await graphql({
            schema: metaSchema,
            source: print(doc),
            rootValue: {},
            contextValue,
        });
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
                { name: 'Int53', kind: 'SCALAR' },
                { name: 'Decimal1', kind: 'SCALAR' },
                { name: 'Decimal2', kind: 'SCALAR' },
                { name: 'Decimal3', kind: 'SCALAR' },
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
                            type: { __typename: 'ScalarType' },
                        },
                    ],
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
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'isoCode',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            collectFieldConfig: null,
                            isCollectField: false,
                            isList: false,
                            isReference: false,
                            isRelation: false,
                            name: 'dummy',
                            referenceKeyField: null,
                            type: {
                                __typename: 'ScalarType',
                            },
                        },
                    ],
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
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'deliveries',
                            isList: true,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' },
                        },
                        {
                            name: 'delivery',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' },
                        },
                        {
                            name: 'deliveryNonRelation',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' },
                        },
                        {
                            name: 'deliveryWithInverseOf',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' },
                        },
                        {
                            name: 'handlingUnits',
                            isList: true,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' },
                        },
                        {
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            name: 'transportKind',
                            type: { __typename: 'EnumType' },
                        },
                        {
                            name: 'totalWeightInKg',
                            collectFieldConfig: {
                                aggregationOperator: 'SUM',
                                fieldsInPath: [
                                    { declaringType: { name: 'Shipment' }, name: 'deliveries' },
                                    { declaringType: { name: 'Delivery' }, name: 'weightInKg' },
                                ],
                                path: ['deliveries', 'weightInKg'],
                            },
                            isCollectField: true,
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            type: {
                                __typename: 'ScalarType',
                            },
                        },
                        {
                            name: 'destinationCountry',
                            collectFieldConfig: null,
                            isCollectField: false,
                            isList: false,
                            isReference: true,
                            isRelation: false,
                            referenceKeyField: {
                                name: 'destinationCountry',
                            },
                            type: {
                                __typename: 'RootEntityType',
                            },
                        },
                    ],
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
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'shipment',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: true,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'RootEntityType' },
                        },
                        {
                            name: 'weightInKg',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
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
                                __typename: 'ScalarType',
                            },
                        },
                        {
                            collectFieldConfig: null,
                            isCollectField: false,
                            isList: false,
                            isReference: true,
                            isRelation: false,
                            name: 'countryOfOrigin',
                            referenceKeyField: {
                                name: 'countryOfOriginIsoCode',
                            },
                            type: {
                                __typename: 'RootEntityType',
                            },
                        },
                    ],
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
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                    ],
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
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'createdAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                        {
                            name: 'updatedAt',
                            isList: false,
                            isReference: false,
                            referenceKeyField: null,
                            isRelation: false,
                            isCollectField: false,
                            collectFieldConfig: null,
                            type: { __typename: 'ScalarType' },
                        },
                    ],
                },
                { name: 'DangerousGoodsInfo', kind: 'ENTITY_EXTENSION', fields: [] },
                {
                    name: 'TransportKind',
                    kind: 'ENUM',
                    values: [{ value: 'AIR' }, { value: 'ROAD' }, { value: 'SEA' }],
                },
            ],
        });
    });

    it('can query single types', async () => {
        const result = await execute(queryPerTypeQuery);
        expect(result).to.deep.equal({
            rootEntityTypes: [
                { name: 'Country' },
                { name: 'Shipment' },
                { name: 'Delivery' },
                { name: 'HandlingUnit' },
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
                { name: 'OffsetDateTime' },
                { name: 'Int53' },
                { name: 'Decimal1' },
                { name: 'Decimal2' },
                { name: 'Decimal3' },
            ],
            enumTypes: [{ name: 'TransportKind' }],
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
                        toType: { name: 'Delivery' },
                    },
                    {
                        fromField: { name: 'delivery' },
                        fromType: { name: 'Shipment' },
                        toField: null,
                        toType: { name: 'Delivery' },
                    },
                    {
                        fromField: { name: 'shipment' },
                        fromType: { name: 'Delivery' },
                        toField: { name: 'deliveryWithInverseOf' },
                        toType: { name: 'Shipment' },
                    },
                ],
            },
        });
    });

    it('can query namespaces', async () => {
        const result = await execute(gql`
            {
                namespaces {
                    name
                    path
                    isRoot
                }
            }
        `);
        expect(result).to.deep.equal({
            namespaces: [
                { name: null, path: [], isRoot: true },
                { name: 'generic', path: ['generic'], isRoot: false },
                { name: 'logistics', path: ['logistics'], isRoot: false },
                { name: 'shipments', path: ['logistics', 'shipments'], isRoot: false },
            ],
        });
    });

    it('can query namespace by path', async () => {
        const result = await execute(gql`
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
        `);
        expect(result).to.deep.equal({
            logistics: { name: 'logistics', path: ['logistics'] },
            root: { name: null, path: [] },
        });
    });

    it('can query enum values', async () => {
        const result = await execute(enumQuery);
        expect(result).to.deep.equal({
            enumType: {
                name: 'TransportKind',
                values: [
                    {
                        value: 'AIR',
                    },
                    {
                        value: 'ROAD',
                    },
                    {
                        value: 'SEA',
                    },
                ],
            },
        });
    });

    it('can query localization with generic provider', async () => {
        const result = (await execute(localizationQuery)) as any;
        const addressType = result.valueObjectType;
        expect(addressType.localization).to.deep.equal({
            label: 'Address',
            labelPlural: 'Addresses',
            hint: null,
        });
        const streetField = addressType.fields.find((f: any) => f.name === 'street');
        expect(streetField.localization).to.deep.equal({
            label: 'Street',
            hint: null,
        });
    });

    it('can query localization with provided language', async () => {
        const result = (await execute(localizationQuery, { locale: ['de', 'en'] })) as any;
        const addressType = result.valueObjectType;
        expect(addressType.localization).to.deep.equal({
            label: 'Adresse',
            labelPlural: 'Adressen',
            hint: 'Eine Adresse',
        });
        const streetField = addressType.fields.find((f: any) => f.name === 'street');
        expect(streetField.localization).to.deep.equal({
            label: 'Straße',
            hint: 'The street and number',
        });
    });

    it('can query raw localization of types', async () => {
        const result = (await execute(rawI18nQuery)) as any;

        // test for object types including fields
        const shipmentType = result.rootEntityType;
        expect(shipmentType.label).to.deep.equal({
            en: 'Shipment',
            de: 'Lieferung',
        });
        expect(shipmentType.labelPlural).to.deep.equal({
            en: 'Shipments',
            de: 'Lieferungen',
        });
        expect(shipmentType.hint).to.deep.equal({
            en: 'A shipment',
            de: 'Eine Lieferung',
        });
        const transportKindField = shipmentType.fields.find(
            (field: any) => field.name === 'transportKind',
        );
        expect(transportKindField.label).to.deep.equal({
            en: 'Transport kind',
            de: 'Transportart',
        });
        expect(transportKindField.hint).to.deep.equal({
            en: 'The kind of transport for the shipment',
            de: 'Transportart der Lieferung',
        });
        const handlingUnitsField = shipmentType.fields.find(
            (field: any) => field.name === 'handlingUnits',
        );
        expect(handlingUnitsField.label).to.deep.equal({
            de: 'Packstücke',
        });
        expect(handlingUnitsField.hint).to.deep.equal({
            de: 'Die Packstücke der Lieferung',
        });

        // test for enumType including values
        const transportKindType = result.enumType;
        expect(transportKindType.label).to.deep.equal({
            en: 'Transport kind',
            de: 'Transportart',
        });
        expect(transportKindType.labelPlural).to.deep.equal({
            en: 'Transport kinds',
            de: 'Transportarten',
        });
        expect(transportKindType.hint).to.deep.equal({
            en: 'The kind of transport',
            de: 'Die Art des Transports',
        });
        const transportKindValueAir = transportKindType.values.find(
            (value: any) => value.value === 'AIR',
        );
        const transportKindValueRoad = transportKindType.values.find(
            (value: any) => value.value === 'ROAD',
        );
        const transportKindValueSea = transportKindType.values.find(
            (value: any) => value.value === 'SEA',
        );
        expect(transportKindValueAir.label).to.deep.equal({
            en: 'Air',
            de: 'Luft',
        });
        expect(transportKindValueAir.hint).to.deep.equal({
            en: 'Delivery via airfreight',
            de: 'Lieferung mittels Fluchtfracht',
        });
        expect(transportKindValueRoad.label).to.deep.equal({
            de: 'Straße',
            en: 'Road',
        });
        expect(transportKindValueRoad.hint).to.deep.equal({
            de: 'Lieferung mittels LKW',
            en: 'Delivery via truck',
        });
        expect(transportKindValueSea.label).to.deep.equal({
            de: 'Übersee',
            en: 'Sea',
        });
        expect(transportKindValueSea.hint).to.deep.equal({
            de: 'Lieferung mittels Schiff',
            en: 'Delivery via ship',
        });

        const adressType = result.valueObjectType;
        expect(adressType.label).to.deep.equal({
            de: 'Adresse',
        });
        expect(adressType.labelPlural).to.deep.equal({
            de: 'Adressen',
        });
        expect(adressType.hint).to.deep.equal({
            de: 'Eine Adresse',
        });
    });

    it('can query permissions', async () => {
        const result = await execute(permissionsQuery, { authRoles: ['user'] });
        expect(result!.rootEntityType).to.deep.equal({
            permissions: { canRead: true, canCreate: false, canUpdate: false, canDelete: false },
            fields: [
                { name: 'id', permissions: { canRead: true, canWrite: true } },
                { name: 'createdAt', permissions: { canRead: true, canWrite: true } },
                { name: 'updatedAt', permissions: { canRead: true, canWrite: true } },
                { name: 'deliveries', permissions: { canRead: false, canWrite: false } },
                { name: 'delivery', permissions: { canRead: false, canWrite: false } },
                { name: 'deliveryNonRelation', permissions: { canRead: false, canWrite: false } },
                { name: 'deliveryWithInverseOf', permissions: { canRead: false, canWrite: false } },
                { name: 'handlingUnits', permissions: { canRead: false, canWrite: false } },
                { name: 'transportKind', permissions: { canRead: false, canWrite: false } },
                { name: 'totalWeightInKg', permissions: { canRead: true, canWrite: true } },
                { name: 'destinationCountry', permissions: { canRead: false, canWrite: false } },
            ],
        });
    });

    it('can query read the cruddl version', async () => {
        const expectedVersion = CRUDDL_VERSION;
        const result = await execute(cruddlVersionQuery);
        const actualVersion = result!.cruddlVersion as string;

        expect(actualVersion).to.deep.equal(expectedVersion);
    });

    it('can query read whether fields are hidden', async () => {
        const result = (await execute(hiddenFieldsQuery)) as any;
        const rootEntityTypeFields = result.rootEntityType.fields;
        const isoCodeField = rootEntityTypeFields.find((field: any) => field.name === 'isoCode');
        const idField = rootEntityTypeFields.find((field: any) => field.name === 'id');
        const dummyField = rootEntityTypeFields.find((field: any) => field.name === 'dummy');
        const updatedAtField = rootEntityTypeFields.find(
            (field: any) => field.name === 'updatedAt',
        );
        expect(isoCodeField.isHidden).to.be.true;
        expect(idField.isHidden).to.be.true;
        expect(dummyField.isHidden).to.be.false;
        expect(updatedAtField.isHidden).to.be.false;
    });

    it('can query read the cruddl version from meta description', async () => {
        const expectedVersion = CRUDDL_VERSION;
        const result = (await execute(cruddlVersionIntrospectionQuery)) as any;
        const description = result.__type.description as string;
        const actualVersion = description.match(/cruddlVersion: "(.*)"/)![1];

        expect(actualVersion).to.deep.equal(expectedVersion);
    });

    after(function () {
        return stopMetaServer();
    });
});
