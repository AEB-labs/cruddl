import { describe, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from '../../../testing/utils/source-validation-utils.js';
import type { PermissionProfileConfigMap } from '../config/permissions.js';

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
});
