import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, DeleteEntitiesQueryNode, FieldQueryNode, QueryNode, RuntimeErrorQueryNode,
    UpdateEntitiesQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';

export function transformDeleteEntitiesQueryNode(node: DeleteEntitiesQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptor(node.objectType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    if (access == PermissionResult.DENIED) {
        return new RuntimeErrorQueryNode(`Not authorized to delete ${node.objectType.name} objects`);
    }

    let filterNode = node.filterNode;
    if (access != PermissionResult.GRANTED) {
        const accessGroupField = node.objectType.getFields()['accessGroup'];
        if (!accessGroupField) {
            throw new Error(`Root entity ${node.objectType.name} has an accessGroup-based permission profile, but no accessGroup field`);
        }
        const itemVar = node.currentEntityVariable;
        const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField, node.objectType);
        filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, accessGroupNode));

        // TODO add preExecQuery if write access is conditional
    }

    if (filterNode != node.filterNode) {
        return new DeleteEntitiesQueryNode({
            ...node,
            filterNode,
        });
    }
    return node;
}
