import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, CreateEntityQueryNode, FieldQueryNode, QueryNode, RuntimeErrorQueryNode,
    UpdateEntitiesQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';

export function transformCreateEntityQueryNode(node: CreateEntityQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptor(node.objectType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to create ${node.objectType.name} objects`);
        default:
            // TODO check the value of accessGroup
            return node;
    }
}
