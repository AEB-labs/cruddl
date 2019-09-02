import { BinaryOperationQueryNode, BinaryOperator, ConditionalQueryNode, EntitiesQueryNode, EntityFromIdQueryNode, NullQueryNode, PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode, TransformListQueryNode, VariableAssignmentQueryNode, VariableQueryNode } from '../../query-tree';
import { FlexSearchQueryNode } from '../../query-tree/flex-search';
import { AccessOperation, AuthContext } from '../auth-basics';
import { PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';

export function transformEntitiesQueryNode(node: EntitiesQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${node.rootEntityType.name} objects`, { code: PERMISSION_DENIED_ERROR });
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
            return new RuntimeErrorQueryNode(`Not authorized to read ${node.rootEntityType.name} objects`, { code: PERMISSION_DENIED_ERROR });
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

export function transformFlexSearchQueryNode(node: FlexSearchQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${node.rootEntityType.name} objects`, { code: PERMISSION_DENIED_ERROR });
        default:
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, node.itemVariable);
            return new FlexSearchQueryNode({
                flexFilterNode: new BinaryOperationQueryNode(node.flexFilterNode, BinaryOperator.AND, condition),
                rootEntityType: node.rootEntityType,
                itemVariable: node.itemVariable
            });
    }
}