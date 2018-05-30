import { expect } from 'chai';
import { startMetaServer, stopMetaServer } from '../dev/server';
import request from 'graphql-request';
import { TypeKind } from '../../src/model/input/type';
import { Model } from '../../src/model/implementation/model';

describe('Model API', () => {

    const endpointURI = 'http://localhost:3001/';
    const introQuery = `
    query {   
      __schema {
        types {
          name
          kind
        }
      }
    }
    `;
    const typeQuery = `
    {
      types {
        ... on ScalarType {name kind description}
        ... on RootEntityType {name kind keyField { name } fields { name description isList isReference isRelation type { __typename }}}
        ... on ValueObjectType {name kind description fields { name description isList isReference isRelation type { __typename }}}
        ... on ChildEntityType {name kind description fields { name description isList isReference isRelation type { __typename }}}
        ... on EntityExtensionType {name kind description fields { name description isList isReference isRelation type { __typename }}}
      }
    }
    `;

    const queryPerTypeQuery = `
    {
      rootEntityTypes {name}
      childEntityTypes {name}
      entityExtensionTypes {name}
      valueObjectTypes {name}
      scalarTypes {name}
      enumTypes {name}
    }
`;

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
    });

    before(function () {

        return startMetaServer(model).then(() => {

        });
    });

    it('starts a GraphQL endpoint', () => {
        return request(endpointURI, introQuery);
    });

    it('can query over all types as a union type', async () => {
        const result = await request(endpointURI, typeQuery);
        expect(result).to.deep.equal({
            'types': [
                { 'name': 'ID', 'kind': 'SCALAR', 'description': null },
                { 'name': 'String', 'kind': 'SCALAR', 'description': null },
                { 'name': 'Boolean', 'kind': 'SCALAR', 'description': null },
                { 'name': 'Int', 'kind': 'SCALAR', 'description': null },
                { 'name': 'Float', 'kind': 'SCALAR', 'description': null },
                { 'name': 'JSON', 'kind': 'SCALAR', 'description': null },
                { 'name': 'DateTime', 'kind': 'SCALAR', 'description': null },
                { 'name': 'Address', 'kind': 'VALUE_OBJECT', 'description': null, 'fields': [{ 'name': 'name', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } }] },
                {
                    'name': 'Country', 'kind': 'ROOT_ENTITY', 'keyField': { 'name': 'isoCode' }, 'fields': [
                    { 'name': 'id', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                    { 'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                    { 'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                    { 'name': 'isoCode', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } }
                ]
                }, {
                    'name': 'Shipment', 'kind': 'ROOT_ENTITY', 'keyField': null, 'fields': [
                        { 'name': 'id', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'deliveries', 'description': null, 'isList': true, 'isReference': false, 'isRelation': true, 'type': { '__typename': 'RootEntityType' } },
                        { 'name': 'delivery', 'description': null, 'isList': false, 'isReference': false, 'isRelation': true, 'type': { '__typename': 'RootEntityType' } },
                        { 'name': 'deliveryNonRelation', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'RootEntityType' } },
                        { 'name': 'deliveryWithInverseOf', 'description': null, 'isList': false, 'isReference': false, 'isRelation': true, 'type': { '__typename': 'RootEntityType' } },
                        { 'name': 'handlingUnits', 'description': null, 'isList': true, 'isReference': false, 'isRelation': true, 'type': { '__typename': 'RootEntityType' } }
                    ]
                }, {
                    'name': 'Delivery', 'kind': 'ROOT_ENTITY', 'keyField': null, 'fields': [
                        { 'name': 'id', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'shipment', 'description': null, 'isList': false, 'isReference': false, 'isRelation': true, 'type': { '__typename': 'RootEntityType' } }
                    ]
                }, {
                    'name': 'HandlingUnit', 'kind': 'ROOT_ENTITY', 'keyField': null, 'fields': [
                        { 'name': 'id', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } }
                    ]
                }, {
                    'name': 'Item', 'kind': 'CHILD_ENTITY', 'description': null, 'fields': [
                        { 'name': 'id', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } },
                        { 'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false, 'isRelation': false, 'type': { '__typename': 'ScalarType' } }
                    ]
                }, { 'name': 'DangerousGoodsInfo', 'kind': 'ENTITY_EXTENSION', 'description': null, 'fields': [] }
            ]
        });
    });

    it('can query single types', async () => {
        const result = await request(endpointURI, queryPerTypeQuery);
        expect(result).to.deep.equal({ "rootEntityTypes": [ { "name": "Country" }, { "name": "Shipment" }, { "name": "Delivery" }, { "name": "HandlingUnit" } ], "childEntityTypes": [ { "name": "Item" } ], "entityExtensionTypes": [ { "name": "DangerousGoodsInfo" } ], "valueObjectTypes": [ { "name": "Address" } ], "scalarTypes": [ { "name": "ID" }, { "name": "String" }, { "name": "Boolean" }, { "name": "Int" }, { "name": "Float" }, { "name": "JSON" }, { "name": "DateTime" } ], "enumTypes": [] });
    });

    after(function () {
        return stopMetaServer();
    });
});
