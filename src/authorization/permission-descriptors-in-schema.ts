import { FieldDefinitionNode, GraphQLField, GraphQLObjectType, ObjectTypeDefinitionNode } from 'graphql';
import { PermissionDescriptor } from './permission-descriptors';

const permissionProfileSymbol = Symbol('permissionProfile');

export function setPermissionDescriptor(node: ObjectTypeDefinitionNode|FieldDefinitionNode, permissionDescriptor: PermissionDescriptor) {
    (node as any)[permissionProfileSymbol] = permissionDescriptor;
}

export function getPermissionDescriptorIfExists(node: GraphQLObjectType|GraphQLField<any, any>): PermissionDescriptor|undefined {
    return (node.astNode as any)[permissionProfileSymbol];
}

export function getPermissionDescriptor(objectType: GraphQLObjectType, field?: GraphQLField<any, any>): PermissionDescriptor {
    const descriptor = getPermissionDescriptorIfExists(field || objectType);
    if (descriptor) {
        return descriptor;
    }
    if (field) {
        throw new Error(`Permission descriptor of field ${objectType.name}.${field.name} is missing`);
    }
    throw new Error(`Permission descriptor of root entity ${objectType.name} missing`);
}
