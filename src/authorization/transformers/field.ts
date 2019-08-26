import { FieldPathQueryNode, FieldQueryNode, PERMISSION_DENIED_ERROR, QueryNode, RuntimeErrorQueryNode } from '../../query-tree';
import { AccessOperation, AuthContext } from '../auth-basics';
import { PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfField } from '../permission-descriptors-in-model';

export function transformFieldQueryNode(node: FieldQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptorOfField(node.field);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${node.field.declaringType.name}.${node.field.name}`, { code: PERMISSION_DENIED_ERROR });
        default:
            throw new Error(`Conditional permission profiles are currently not supported on fields, but used in ${node.field.declaringType.name}.${node.field.name}`);
    }
}

export function transformFieldPathQueryNode(node: FieldPathQueryNode, authContext: AuthContext): QueryNode {
    for (const field of node.path) {
        const permissionDescriptor = getPermissionDescriptorOfField(field);
        const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
        switch (access) {
            case PermissionResult.GRANTED:
                break;
            case PermissionResult.DENIED:
                return new RuntimeErrorQueryNode(`Not authorized to read ${field.declaringType.name}.${field.name}`, { code: PERMISSION_DENIED_ERROR });
            default:
                throw new Error(`Conditional permission profiles are currently not supported on fields, but used in ${field.declaringType.name}.${field.name}`);
        }
    }
    return node;

}
