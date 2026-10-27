import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
    validate,
} from '../../../testing/utils/source-validation-utils.js';
import { Project } from '../../project/project.js';
import { ProjectSource } from '../../project/source.js';
import type { PermissionProfileConfigMap } from '../config/permissions.js';
import { Severity } from '../validation/message.js';

function getPermissionProfiles(field: string): PermissionProfileConfigMap {
    return {
        restricted: {
            permissions: [
                {
                    roles: ['user'],
                    access: 'readWrite',
                    restrictions: [{ field, claim: 'groups' }],
                },
            ],
        },
    };
}

describe('permission profile restrictions', () => {
    it('accepts a scalar field', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    group: String @accessField
                }
            `,
            { permissionProfiles: getPermissionProfiles('group') },
        );
    });

    it('accepts a list of scalars', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    groups: [String] @accessField
                }
            `,
            { permissionProfiles: getPermissionProfiles('groups') },
        );
    });

    it('accepts a list of enum values', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                enum Group { A, B }
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    groups: [Group] @accessField
                }
            `,
            { permissionProfiles: getPermissionProfiles('groups') },
        );
    });

    it('accepts a list of scalars within a value object', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    info: Info @accessField
                }
                type Info @valueObject {
                    groups: [String] @accessField
                }
            `,
            { permissionProfiles: getPermissionProfiles('info.groups') },
        );
    });

    it('accepts a list of scalars within an entity extension', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    info: Info @accessField
                }
                type Info @entityExtension {
                    groups: [String] @accessField
                }
            `,
            { permissionProfiles: getPermissionProfiles('info.groups') },
        );
    });

    it('accepts a list of scalars in a flexSearch-indexed type', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                type Shipment @rootEntity(permissionProfile: "restricted", flexSearch: true) {
                    groups: [String] @accessField @flexSearch
                }
            `,
            { permissionProfiles: getPermissionProfiles('groups') },
        );
    });

    it('rejects a list of scalars without @flexSearch in a flexSearch-indexed type', () => {
        assertValidatorRejects(
            `
                type Shipment @rootEntity(permissionProfile: "restricted", flexSearch: true) {
                    groups: [String] @accessField
                }
            `,
            [
                'Permission profile "restricted" defines restrictions that cannot be applied to type "Shipment": Field "Shipment.groups" needs the @flexSearch directive because type "Shipment" is marked with "flexSearch: true".',
                'Cannot be applied to type "Shipment": Field "Shipment.groups" needs the @flexSearch directive because type "Shipment" is marked with "flexSearch: true".',
            ],
            { permissionProfiles: getPermissionProfiles('groups') },
        );
    });

    it('rejects a list of scalars without @accessField', () => {
        assertValidatorRejects(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    groups: [String]
                }
            `,
            [
                'Permission profile "restricted" defines restrictions that cannot be applied to type "Shipment": Field "Shipment.groups" needs the @accessField directive to be used in a permission restriction.',
                'Cannot be applied to type "Shipment": Field "Shipment.groups" needs the @accessField directive to be used in a permission restriction.',
            ],
            { permissionProfiles: getPermissionProfiles('groups') },
        );
    });

    it('rejects a list of value objects', () => {
        assertValidatorRejects(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    infos: [Info] @accessField
                }
                type Info @valueObject {
                    group: String @accessField
                }
            `,
            [
                'Permission profile "restricted" defines restrictions that cannot be applied to type "Shipment": Field "Shipment.infos" is of type "Info", but only fields of scalar and enum types (or lists of them) can be used for field restrictions.',
                'Cannot be applied to type "Shipment": Field "Shipment.infos" is of type "Info", but only fields of scalar and enum types (or lists of them) can be used for field restrictions.',
            ],
            { permissionProfiles: getPermissionProfiles('infos') },
        );
    });

    it('warns about navigating into a list', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    infos: [Info] @accessField
                }
                type Info @valueObject {
                    group: String @accessField
                }
            `,
            'Permission profile "restricted" defines a restriction on field "infos.group", but field "Shipment.infos" is a list and cannot be navigated into. Lists are only supported as the last field of a restriction path. This will be an error in a future release.',
            { permissionProfiles: getPermissionProfiles('infos.group') },
        );
    });

    it('warns about list accessGroup fields used with restrictToAccessGroups', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    accessGroup: [String]
                }
            `,
            'Field "accessGroup" must not be a list to be used with "restrictToAccessGroups" (permission profile "restricted"). Use a String or enum field, or use "restrictions" on an @accessField list field. This will be an error in a future release.',
            {
                permissionProfiles: {
                    restricted: {
                        permissions: [
                            {
                                roles: ['user'],
                                access: 'readWrite',
                                restrictToAccessGroups: ['group1'],
                            },
                        ],
                    },
                },
            },
        );
    });

    function getProfilesWithRestriction(restriction: object): PermissionProfileConfigMap {
        return {
            restricted: {
                permissions: [
                    {
                        roles: ['user'],
                        access: 'readWrite',
                        restrictions: [restriction as { field: string }],
                    },
                ],
            },
        };
    }

    const prefix = 'Permission profile "restricted" defines an unsupported restriction: ';
    const suffix = ' This will be an error in a future release.';

    it('warns about fields of types that are stored as objects', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    description: I18nString @accessField
                }
            `,
            `${prefix}Fields of type "I18nString" cannot be used in permission restrictions (field "Shipment.description").${suffix}`,
            {
                permissionProfiles: getProfilesWithRestriction({
                    field: 'description',
                    value: 'a',
                }),
            },
        );
    });

    it('warns about null values', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    owner: String @accessField
                }
            `,
            `${prefix}Restriction value null on field "Shipment.owner" has no defined behavior.${suffix}`,
            { permissionProfiles: getProfilesWithRestriction({ field: 'owner', value: null }) },
        );
    });

    it('warns about list values', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    owner: String @accessField
                }
            `,
            `${prefix}Restriction value on field "Shipment.owner" is a list or an object, which is not supported. Use one permission per value, or "claim" with a list claim.${suffix}`,
            {
                permissionProfiles: getProfilesWithRestriction({
                    field: 'owner',
                    value: ['a', 'b'],
                }),
            },
        );
    });

    it('warns about values that are not part of the enum', () => {
        assertValidatorWarns(
            `
                enum Region { EUROPE, ASIA }
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    region: Region @accessField
                }
            `,
            `${prefix}Restriction value "EUROP" on field "Shipment.region" is not a value of enum "Region". Valid values: EUROPE, ASIA.${suffix}`,
            { permissionProfiles: getProfilesWithRestriction({ field: 'region', value: 'EUROP' }) },
        );
    });

    it('warns about values that do not match the field type', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    isTopSecret: Boolean @accessField
                }
            `,
            `${prefix}Restriction value "false" on field "Shipment.isTopSecret" must be a boolean because the field is of type "Boolean".${suffix}`,
            {
                permissionProfiles: getProfilesWithRestriction({
                    field: 'isTopSecret',
                    value: 'false',
                }),
            },
        );
    });

    it('accepts values that match the field type', () => {
        assertValidatorAcceptsAndDoesNotWarn(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    isTopSecret: Boolean @accessField
                }
            `,
            {
                permissionProfiles: getProfilesWithRestriction({
                    field: 'isTopSecret',
                    value: false,
                }),
            },
        );
    });

    it('warns about claims on fields that are not strings', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    count: Int @accessField
                }
            `,
            `${prefix}"valueTemplate" and "claim" produce strings and can only be used on fields of type String, ID or an enum type, but field "Shipment.count" is of type "Int".${suffix}`,
            { permissionProfiles: getProfilesWithRestriction({ field: 'count', claim: 'count' }) },
        );
    });

    it('warns about access groups that are not part of the enum', () => {
        assertValidatorWarns(
            `
                enum Group { ACCOUNTING, LOGISTICS }
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    accessGroup: Group
                }
            `,
            `Access group "LOGISTIC" in permission profile "restricted" is not a value of enum "Group" (field "Shipment.accessGroup"), so it never matches. Valid values: ACCOUNTING, LOGISTICS.${suffix}`,
            {
                permissionProfiles: {
                    restricted: {
                        permissions: [
                            {
                                roles: ['user'],
                                access: 'readWrite',
                                restrictToAccessGroups: ['ACCOUNTING', 'LOGISTIC'],
                            },
                        ],
                    },
                },
            },
        );
    });

    describe('quick fixes for restriction values', () => {
        function getMessages(schema: string, profilesSource: ProjectSource) {
            return new Project([
                new ProjectSource('schema.graphqls', schema),
                profilesSource,
            ]).validate().messages;
        }

        function getProfilesJson(permission: object) {
            return new ProjectSource(
                'permission-profiles.json',
                JSON.stringify({
                    permissionProfiles: {
                        restricted: {
                            permissions: [{ roles: ['user'], access: 'readWrite', ...permission }],
                        },
                    },
                }),
            );
        }

        it('offers to convert a restriction value to the field type', () => {
            const source = getProfilesJson({
                restrictions: [{ field: 'isTopSecret', value: 'false' }],
            });
            const messages = getMessages(
                `type Shipment @rootEntity(permissionProfile: "restricted") { isTopSecret: Boolean @accessField }`,
                source,
            );
            expect(applyQuickFix(messages, 'Change value to false')).to.equal(
                source.body.replace('"value":"false"', '"value":false'),
            );
        });

        it('offers to convert a restriction value to the field type in YAML', () => {
            const source = new ProjectSource(
                'permission-profiles.yaml',
                'permissionProfiles:\n  restricted:\n    permissions:\n      - roles: [user]\n        access: readWrite\n        restrictions:\n          - field: count\n            value: "5"\n',
            );
            const messages = getMessages(
                `type Shipment @rootEntity(permissionProfile: "restricted") { count: Int @accessField }`,
                source,
            );
            expect(applyQuickFix(messages, 'Change value to 5')).to.equal(
                source.body.replace('value: "5"', 'value: 5'),
            );
        });

        it('offers to fix the case of an enum value', () => {
            const source = getProfilesJson({
                restrictions: [{ field: 'region', value: 'europe' }],
            });
            const messages = getMessages(
                `
                    enum Region { EUROPE, ASIA }
                    type Shipment @rootEntity(permissionProfile: "restricted") { region: Region @accessField }
                `,
                source,
            );
            expect(applyQuickFix(messages, 'Change value to "EUROPE"')).to.equal(
                source.body.replace('"europe"', '"EUROPE"'),
            );
        });

        it('offers to fix the case of an access group', () => {
            const source = getProfilesJson({ restrictToAccessGroups: ['ACCOUNTING', 'logistics'] });
            const messages = getMessages(
                `
                    enum Group { ACCOUNTING, LOGISTICS }
                    type Shipment @rootEntity(permissionProfile: "restricted") { accessGroup: Group }
                `,
                source,
            );
            expect(applyQuickFix(messages, 'Change value to "LOGISTICS"')).to.equal(
                source.body.replace('"logistics"', '"LOGISTICS"'),
            );
        });
    });

    it('informs about @accessField on fields that are not used in restrictions', () => {
        const result = validate(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    group: String @accessField
                    other: String @accessField
                }
            `,
            { permissionProfiles: getPermissionProfiles('group') },
        );
        expect(
            result.messages.map((m) => ({ severity: m.severity, message: m.message })),
        ).to.deep.equal([
            {
                severity: Severity.INFO,
                message:
                    '@accessField has no effect because field "Shipment.other" is not used in a restriction of a permission profile. Note that @accessField makes flexSearch filters on this field case-sensitive.',
            },
        ]);
    });

    it('offers to remove @accessField from fields that are not used in restrictions', () => {
        const schema = `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    group: String @accessField
                    other: String @accessField @key
                }
            `;
        const result = validate(schema, { permissionProfiles: getPermissionProfiles('group') });
        expect(applyQuickFix(result.messages, 'Remove @accessField')).to.equal(
            schema.replace('other: String @accessField @key', 'other: String @key'),
        );
    });

    it('warns about permission profiles without permissions', () => {
        assertValidatorWarns(
            `
                type Shipment @rootEntity(permissionProfile: "restricted") {
                    group: String
                }
            `,
            'Permission profile "restricted" does not define any permissions, so access is denied for everyone.',
            { permissionProfiles: { restricted: { permissions: [] } } },
        );
    });
});
