import { beforeAll, describe, expect, it } from 'vitest';
import type { Model } from '../model/implementation/model.js';
import { Project } from '../project/project.js';
import { ProjectSource } from '../project/source.js';
import type { AccessConditionDescription } from './describe-access-condition.js';
import { describeAccessCondition } from './describe-access-condition.js';

describe('describeAccessCondition', () => {
    let model: Model;

    beforeAll(() => {
        const project = new Project({
            sources: [
                new ProjectSource(
                    'schema.graphqls',
                    `
                    type File @rootEntity(permissionProfile: "restricted") {
                        name: String
                        customerName: String @accessField
                        accessGroup: String
                        tags: [String] @accessField
                        address: Address @accessField
                    }

                    type Address @valueObject {
                        country: String @accessField
                    }

                    type Note @rootEntity @roles(read: "reader") {
                        text: String
                    }
                `,
                ),
                new ProjectSource(
                    'permission-profiles.json',
                    JSON.stringify({
                        permissionProfiles: {
                            restricted: {
                                permissions: [
                                    { roles: ['admin'], access: 'readWrite' },
                                    {
                                        roles: ['customer'],
                                        access: 'read',
                                        restrictions: [
                                            { field: 'customerName', claim: 'customers' },
                                            { field: 'tags', value: 'public' },
                                        ],
                                    },
                                    {
                                        roles: ['/^country-(.*)$/'],
                                        access: 'readWrite',
                                        restrictToAccessGroups: ['shared'],
                                        restrictions: [
                                            { field: 'address.country', valueTemplate: '$1' },
                                        ],
                                    },
                                ],
                            },
                        },
                    }),
                ),
            ],
        });
        model = project.getModel();
        expect(
            project
                .validate()
                .getErrors()
                .map((m) => m.message),
        ).toEqual([]);
    });

    function describeFor(
        typeName: string,
        authContext: Parameters<typeof describeAccessCondition>[1],
        operation?: Parameters<typeof describeAccessCondition>[2],
    ): AccessConditionDescription {
        const result = describeAccessCondition(
            model.getRootEntityTypeOrThrow(typeName),
            authContext,
            operation,
        );
        // the locations are tested separately
        return JSON.parse(
            JSON.stringify(result, (key, value) => (key === 'loc' ? undefined : value)),
        );
    }

    it('reports granted access', () => {
        expect(describeFor('File', { authRoles: ['admin'] })).toEqual({ kind: 'granted' });
        expect(describeFor('Note', { authRoles: ['reader'] })).toEqual({ kind: 'granted' });
    });

    it('reports denied access', () => {
        expect(describeFor('File', { authRoles: ['other'] })).toEqual({ kind: 'denied' });
        expect(describeFor('Note', { authRoles: ['reader'] }, 'UPDATE')).toEqual({
            kind: 'denied',
        });
    });

    it('describes restrictions with their values', () => {
        expect(
            describeFor('File', {
                authRoles: ['customer'],
                claims: { customers: ['C1', 'C2'] },
            }),
        ).toEqual({
            kind: 'restricted',
            permissionProfileName: 'restricted',
            permissions: [
                {
                    restrictions: [
                        {
                            fieldPath: ['customerName'],
                            source: 'claim',
                            claim: 'customers',
                            values: ['C1', 'C2'],
                        },
                        { fieldPath: ['tags'], source: 'value', values: ['public'] },
                    ],
                },
            ],
        });
    });

    it('reports denied access if a claim of the only applicable permission is missing', () => {
        expect(describeFor('File', { authRoles: ['customer'] })).toEqual({ kind: 'denied' });
    });

    it('describes access groups and evaluated templates', () => {
        expect(describeFor('File', { authRoles: ['country-DE'] }, 'UPDATE')).toEqual({
            kind: 'restricted',
            permissionProfileName: 'restricted',
            permissions: [
                {
                    accessGroups: ['shared'],
                    restrictions: [
                        {
                            fieldPath: ['address', 'country'],
                            source: 'valueTemplate',
                            values: ['DE'],
                        },
                    ],
                },
            ],
        });
    });

    it('only includes the permissions that apply to the operation', () => {
        expect(describeFor('File', { authRoles: ['customer'] }, 'UPDATE')).toEqual({
            kind: 'denied',
        });
    });

    it('includes the source locations', () => {
        const result = describeAccessCondition(model.getRootEntityTypeOrThrow('File'), {
            authRoles: ['customer'],
            claims: { customers: 'C1' },
        });
        if (result.kind !== 'restricted') {
            throw new Error(`Expected restricted access`);
        }
        expect(result.permissions[0].loc?.sourceName).toBe('permission-profiles.json');
        expect(result.permissions[0].restrictions[0].loc?.sourceName).toBe(
            'permission-profiles.json',
        );
    });
});
