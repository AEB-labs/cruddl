import {
    ConditionalQueryNode, EntitiesQueryNode, EntityFromIdQueryNode, NullQueryNode, RuntimeErrorQueryNode,
    TransformListQueryNode, VariableAssignmentQueryNode, VariableQueryNode
} from '../../query/definition';
import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
import { PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';

export function transformEntitiesQueryNode(node: EntitiesQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to read ${node.rootEntityType.name} objects`);
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

export function transformEntityFromIdQueryNode(node: EntityFromIdQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to read ${node.rootEntityType.name} objects`);
        default:
            const entityVar = new VariableQueryNode('entity');
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, entityVar);
            return new VariableAssignmentQueryNode({
                variableNode: entityVar,
                variableValueNode: node,
                resultNode: new ConditionalQueryNode(condition, entityVar, new NullQueryNode())
            });
    }
}
