import { FieldDefinitionNode, GraphQLField, GraphQLObjectType, ObjectTypeDefinitionNode } from 'graphql';
import { PermissionDescriptor } from './permission-descriptors';

const permissionProfileSymbol = Symbol('permissionProfile');

export function setPermissionDescriptor(node: GraphQLObjectType|GraphQLField<any, any>, permissionDescriptor: PermissionDescriptor) {
    // use astNode because symbols on object types are discarded by schema-transformer
    const astNode = (node as any).astNode;
    if (!astNode) {
        throw new Error(`Can't set permission descriptor on node without astNode (${node.name})`);
    }

    (node as any).astNode[permissionProfileSymbol] = permissionDescriptor;
}

export function getPermissionDescriptorIfExists(node: GraphQLObjectType|GraphQLField<any, any>): PermissionDescriptor|undefined {
    return (node as any).astNode[permissionProfileSymbol];
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
