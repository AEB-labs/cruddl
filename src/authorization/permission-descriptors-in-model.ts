import { Field, RootEntityType } from '../model/implementation';
import {
    AlwaysGrantPermissionDescriptor,
    PermissionDescriptor, ProfileBasedPermissionDescriptor, StaticPermissionDescriptor
} from './permission-descriptors';

export function getPermissionDescriptorOfRootEntityType(rootEntityType: RootEntityType): PermissionDescriptor{
    if (rootEntityType.permissionProfile) {
        return new ProfileBasedPermissionDescriptor(rootEntityType.permissionProfile, rootEntityType);
    }
    if (rootEntityType.roles) {
        return new StaticPermissionDescriptor(rootEntityType.roles.read, rootEntityType.roles.readWrite);
    }
    throw new Error(`Root entity "${rootEntityType}" neither has a permission profile, nor does it define roles.`);
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
