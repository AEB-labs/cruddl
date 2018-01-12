import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, FieldQueryNode, QueryNode, RuntimeErrorQueryNode, UpdateEntitiesQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';

export function transformUpdateEntitiesQueryNode(node: UpdateEntitiesQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptor(node.objectType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    if (access == PermissionResult.DENIED) {
        return new RuntimeErrorQueryNode(`Not authorized to update ${node.objectType.name} objects`);
    }

    let filterNode = node.filterNode;
    if (access != PermissionResult.GRANTED) {
        const readAccess = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
        // If we can't write unconditionally, we might still be able to read unconditionally and wouldn't need a filter
        if (readAccess != PermissionResult.GRANTED) {
            const accessGroupField = node.objectType.getFields()['accessGroup'];
            if (!accessGroupField) {
                throw new Error(`Root entity ${node.objectType.name} has an accessGroup-based permission profile, but no accessGroup field`);
            }
            const itemVar = node.currentEntityVariable;
            const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField, node.objectType);
            filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, accessGroupNode));
        }
        // TODO add preExecQuery if write access is conditional
    }

    if (filterNode != node.filterNode) {
        return new UpdateEntitiesQueryNode({
            ...node,
            filterNode,
        });
    }
    return node;
}
