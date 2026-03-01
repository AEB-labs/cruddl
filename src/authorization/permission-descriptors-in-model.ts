import type { Field, RootEntityType } from '../model/index.js';
import type { PermissionDescriptor } from './permission-descriptors.js';
import {
    AlwaysDenyPermissionDescriptor,
    AlwaysGrantPermissionDescriptor,
    ProfileBasedPermissionDescriptor,
    StaticPermissionDescriptor,
} from './permission-descriptors.js';

export function getPermissionDescriptorOfRootEntityType(
    rootEntityType: RootEntityType,
): PermissionDescriptor {
    if (rootEntityType.permissionProfile) {
        return new ProfileBasedPermissionDescriptor(
            rootEntityType.permissionProfile,
            rootEntityType,
        );
    }
    if (rootEntityType.roles) {
        return new StaticPermissionDescriptor(
            rootEntityType.roles.read,
            rootEntityType.roles.readWrite,
        );
    }
    // by default, no permissions are granted
    return new AlwaysDenyPermissionDescriptor();
}

export function getPermissionDescriptorOfField(field: Field): PermissionDescriptor {
    if (field.permissionProfile) {
        return new ProfileBasedPermissionDescriptor(field.permissionProfile);
    }
    if (field.roles) {
        return new StaticPermissionDescriptor(field.roles.read, field.roles.readWrite);
    }
    // no further restrictions on this field
    return new AlwaysGrantPermissionDescriptor();
}
