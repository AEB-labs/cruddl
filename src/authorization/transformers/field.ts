import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
import { FieldQueryNode, QueryNode, RuntimeErrorQueryNode } from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';

export function transformFieldQueryNode(node: FieldQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptor(node.objectType, node.field);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to read ${node.objectType.name}.${node.field.name}`);
        default:
            throw new Error(`Conditional permission profiles are currently not supported on fields, but used in ${node.objectType.name}.${node.field.name}`);
    }
}
