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

    // TODO check updated fields (might want to add some more metadata to the UpdateSpecification objects)
    const updates = node.updates;

    let filterNode = node.filterNode;
    if (access != PermissionResult.GRANTED) {
        const accessGroupField = node.objectType.getFields()['accessGroup'];
        if (!accessGroupField) {
            throw new Error(`Root entity ${node.objectType.name} has an accessGroup-based permission profile, but no accessGroup field`);
        }
        const itemVar = node.currentEntityVariable;
        const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField, node.objectType);
        filterNode = new BinaryOperationQueryNode(filterNode, BinaryOperator.AND, permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, accessGroupNode));
    }

    if (updates != node.updates || filterNode != node.filterNode) {
        return new UpdateEntitiesQueryNode({
            ...node,
            updates,
            filterNode,
        });
    }
    return node;
}
