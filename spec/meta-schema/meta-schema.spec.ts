import { expect } from 'chai';
import { DocumentNode, graphql, print } from 'graphql';
import gql from 'graphql-tag';
import { getMetaSchema } from '../../src/meta-schema/meta-schema';
import { Model, TypeKind } from '../../src/model';
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
                ... on ScalarType {name kind description}
                ... on RootEntityType {name kind keyField { name } fields { name description isList isReference isRelation type { __typename }}}
                ... on ValueObjectType {name kind description fields { name description isList isReference isRelation type { __typename }}}
                ... on ChildEntityType {name kind description fields { name description isList isReference isRelation type { __typename }}}
                ... on EntityExtensionType {name kind description fields { name description isList isReference isRelation type { __typename }}}
            }
        }
    `;

    const queryPerTypeQuery = gql`
        {
            rootEntityTypes {name}
            childEntityTypes {name}
            entityExtensionTypes {name}
            valueObjectTypes {name}
            scalarTypes {name}
            enumTypes {name}
        }
    `;

    const relationQuery = gql`
        {
            rootEntityType(name:"Delivery") {
                name
                relations {
                    fromField {name}
                    fromType {name}
                    toField {name}
                    toType {name}
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
                ],
                namespacePath: ['generic']
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
                ],
                namespacePath: ['logistics', 'shipments']
            }, {
                name: 'Delivery',
                kind: TypeKind.ROOT_ENTITY,
                fields: [
                    {
                        name: 'shipment',
                        typeName: 'Shipment',
                        isRelation: true
                    }
                ],
                namespacePath: ['logistics']
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

    const metaSchema = getMetaSchema(model);

    async function execute(doc: DocumentNode) {
        const { data, errors } = await graphql(metaSchema, print(doc));
        if (errors) {
            throw new Error(JSON.stringify(errors));
        }
        return data;
    }

    it('can query over all types', async () => {
        const result = await execute(typeQuery);
        expect(result).to.deep.equal({
            'types': [
                {'name': 'ID', 'kind': 'SCALAR', 'description': null},
                {'name': 'String', 'kind': 'SCALAR', 'description': null},
                {'name': 'Boolean', 'kind': 'SCALAR', 'description': null},
                {'name': 'Int', 'kind': 'SCALAR', 'description': null},
                {'name': 'Float', 'kind': 'SCALAR', 'description': null},
                {'name': 'JSON', 'kind': 'SCALAR', 'description': null},
                {'name': 'DateTime', 'kind': 'SCALAR', 'description': null},
                {
                    'name': 'Address', 'kind': 'VALUE_OBJECT', 'description': null, 'fields': [
                        {
                            'name': 'name', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        }
                    ]
                },
                {
                    'name': 'Country', 'kind': 'ROOT_ENTITY', 'keyField': {'name': 'isoCode'}, 'fields': [
                        {
                            'name': 'id', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'isoCode', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        }
                    ]
                }, {
                    'name': 'Shipment', 'kind': 'ROOT_ENTITY', 'keyField': null, 'fields': [
                        {
                            'name': 'id', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'deliveries', 'description': null, 'isList': true, 'isReference': false,
                            'isRelation': true, 'type': {'__typename': 'RootEntityType'}
                        },
                        {
                            'name': 'delivery', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': true, 'type': {'__typename': 'RootEntityType'}
                        },
                        {
                            'name': 'deliveryNonRelation', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'RootEntityType'}
                        },
                        {
                            'name': 'deliveryWithInverseOf', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': true, 'type': {'__typename': 'RootEntityType'}
                        },
                        {
                            'name': 'handlingUnits', 'description': null, 'isList': true, 'isReference': false,
                            'isRelation': true, 'type': {'__typename': 'RootEntityType'}
                        }
                    ]
                }, {
                    'name': 'Delivery', 'kind': 'ROOT_ENTITY', 'keyField': null, 'fields': [
                        {
                            'name': 'id', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'shipment', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': true, 'type': {'__typename': 'RootEntityType'}
                        }
                    ]
                }, {
                    'name': 'HandlingUnit', 'kind': 'ROOT_ENTITY', 'keyField': null, 'fields': [
                        {
                            'name': 'id', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        }
                    ]
                }, {
                    'name': 'Item', 'kind': 'CHILD_ENTITY', 'description': null, 'fields': [
                        {
                            'name': 'id', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'createdAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        },
                        {
                            'name': 'updatedAt', 'description': null, 'isList': false, 'isReference': false,
                            'isRelation': false, 'type': {'__typename': 'ScalarType'}
                        }
                    ]
                }, {'name': 'DangerousGoodsInfo', 'kind': 'ENTITY_EXTENSION', 'description': null, 'fields': []}
            ]
        });
    });

    it('can query single types', async () => {
        const result = await execute(queryPerTypeQuery);
        expect(result).to.deep.equal({
            'rootEntityTypes': [
                {'name': 'Country'}, {'name': 'Shipment'}, {'name': 'Delivery'}, {'name': 'HandlingUnit'}
            ], 'childEntityTypes': [{'name': 'Item'}], 'entityExtensionTypes': [{'name': 'DangerousGoodsInfo'}],
            'valueObjectTypes': [{'name': 'Address'}], 'scalarTypes': [
                {'name': 'ID'}, {'name': 'String'}, {'name': 'Boolean'}, {'name': 'Int'}, {'name': 'Float'},
                {'name': 'JSON'}, {'name': 'DateTime'}
            ], 'enumTypes': []
        });
    });

    it('can query relations', async () => {
        const result = await execute(relationQuery);
        expect(result).to.deep.equal({
            'rootEntityType': {
                'name': 'Delivery', 'relations': [
                    {
                        'fromField': {'name': 'shipment'}, 'fromType': {'name': 'Delivery'},
                        'toField': {'name': 'deliveryWithInverseOf'}, 'toType': {'name': 'Shipment'}
                    }
                ]
            }
        });
    });

    it('can query namespaces', async () => {
        const result = await execute(gql`{namespaces{name path isRoot}}`);
        expect(result).to.deep.equal({
            'namespaces': [
                {'name': null, 'path': [], 'isRoot': true},
                {'name': 'generic', 'path': ['generic'], 'isRoot': false},
                {'name': 'logistics', 'path': ['logistics'], 'isRoot': false},
                {'name': 'shipments', 'path': ['logistics', 'shipments'], 'isRoot': false}
            ]
        });
    });

    it('can query namespace by path', async () => {
        const result = await execute(gql`{logistics: namespace(path: ["logistics"]) { name path } root: namespace(path: []) { name path } }`);
        expect(result).to.deep.equal({
            'logistics': {'name': 'logistics', 'path': ['logistics']},
            'root': {'name': null, 'path': []}
        });
    });

    after(function () {
        return stopMetaServer();
    });
});
