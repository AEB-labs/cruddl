import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
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
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to read ${node.objectType.name} objects`);
        default:
            const itemVar = new VariableQueryNode('item');
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, itemVar);
            return new TransformListQueryNode({
                listNode: node,
                filterNode: condition,
                itemVariable: itemVar
            });
    }
}
