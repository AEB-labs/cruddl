import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConditionalQueryNode,
    EntitiesQueryNode,
    EntityFromIdQueryNode,
    FirstOfListQueryNode,
    NullQueryNode,
    PERMISSION_DENIED_ERROR,
    RootEntityIDQueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableAssignmentQueryNode,
    VariableQueryNode,
} from '../../query-tree';
import { FlexSearchQueryNode } from '../../query-tree/flex-search';
import { AccessOperation, AuthContext } from '../auth-basics';
import { PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';
import { decapitalize } from '../../utils/utils';

export function transformEntitiesQueryNode(node: EntitiesQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to read ${node.rootEntityType.name} objects`,
                { code: PERMISSION_DENIED_ERROR },
            );
        default:
            const itemVar = new VariableQueryNode('item');
            const condition = permissionDescriptor.getAccessCondition(
                authContext,
                AccessOperation.READ,
                itemVar,
            );
            return new TransformListQueryNode({
                listNode: node,
                filterNode: condition,
                itemVariable: itemVar,
            });
    }
}

export function transformEntityFromIdQueryNode(
    node: EntityFromIdQueryNode,
    authContext: AuthContext,
) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to read ${node.rootEntityType.name} objects`,
                { code: PERMISSION_DENIED_ERROR },
            );
        default:
            // EntityFromIdQueryNode is converted to FIRST(FOR e in ... FILTER ... RETURN), so it's
            // best to just add the condition there

            const itemVariable = new VariableQueryNode(decapitalize(node.rootEntityType.name));
            const condition = permissionDescriptor.getAccessCondition(
                authContext,
                AccessOperation.READ,
                itemVariable,
            );
            const idEqualsNode = new BinaryOperationQueryNode(
                new RootEntityIDQueryNode(itemVariable),
                BinaryOperator.EQUAL,
                node.idNode,
            );
            return new FirstOfListQueryNode(
                new TransformListQueryNode({
                    listNode: new EntitiesQueryNode(node.rootEntityType),
                    itemVariable,
                    filterNode: new BinaryOperationQueryNode(
                        idEqualsNode,
                        BinaryOperator.AND,
                        condition,
                    ),
                    maxCount: 1,
                }),
            );
    }
}

export function transformFlexSearchQueryNode(node: FlexSearchQueryNode, authContext: AuthContext) {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to read ${node.rootEntityType.name} objects`,
                { code: PERMISSION_DENIED_ERROR },
            );
        default:
            const condition = permissionDescriptor.getAccessCondition(
                authContext,
                AccessOperation.READ,
                node.itemVariable,
            );
            return new FlexSearchQueryNode({
                flexFilterNode: new BinaryOperationQueryNode(
                    node.flexFilterNode,
                    BinaryOperator.AND,
                    condition,
                ),
                rootEntityType: node.rootEntityType,
                itemVariable: node.itemVariable,
            });
    }
}
