import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    EntitiesQueryNode, FieldQueryNode, RuntimeErrorQueryNode, TransformListQueryNode, VariableQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';

export function transformEntitiesQueryNode(node: EntitiesQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptor(node.objectType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${node.objectType.name} objects`);
        default:
            const accessGroupField = node.objectType.getFields()['accessGroup'];
            if (!accessGroupField) {
                throw new Error(`Root entity ${node.objectType.name} has an accessGroup-based permission profile, but no accessGroup field`);
            }
            const itemVar = new VariableQueryNode('item');
            const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField, node.objectType);
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, accessGroupNode);
            return new TransformListQueryNode({
                listNode: node,
                filterNode: condition,
                itemVariable: itemVar
            });
    }
}
