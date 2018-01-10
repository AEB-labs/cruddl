import { GraphQLObjectType, ObjectTypeDefinitionNode } from 'graphql';
import { PermissionDescriptor } from './permission-descriptors';

const permissionProfileSymbol = Symbol('permissionProfile');

export function setPermissionDescriptor(rootEntity: ObjectTypeDefinitionNode, permissionDescriptor: PermissionDescriptor) {
    (rootEntity as any)[permissionProfileSymbol] = permissionDescriptor;
}

export function getPermissionDescriptor(rootEntity: GraphQLObjectType|ObjectTypeDefinitionNode): PermissionDescriptor|undefined {
    if (rootEntity instanceof GraphQLObjectType) {
        return getPermissionDescriptor(rootEntity.astNode!);
    }
    return (rootEntity as any)[permissionProfileSymbol];
}
