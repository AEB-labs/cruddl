import {
    FollowEdgeQueryNode,
    PERMISSION_DENIED_ERROR,
    QueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableQueryNode,
} from '../../query-tree';
import { AccessOperation, AuthContext } from '../auth-basics';
import { PermissionResult } from '../permission-descriptors';
import {
    getPermissionDescriptorOfField,
    getPermissionDescriptorOfRootEntityType,
} from '../permission-descriptors-in-model';

export function transformFollowEdgeQueryNode(
    node: FollowEdgeQueryNode,
    authContext: AuthContext,
): QueryNode {
    const sourceType = node.relationSide.sourceType;
    const sourceField = node.relationSide.sourceField;
    if (!sourceField) {
        throw new Error(
            `Encountered FollowEdgeQueryNode which traverses via non-existing inverse field (on ${sourceType.name})`,
        );
    }
    const fieldPermissionDescriptor = getPermissionDescriptorOfField(sourceField);
    const access = fieldPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to read ${sourceType.name}.${sourceField.name}`,
                { code: PERMISSION_DENIED_ERROR },
            );
        case PermissionResult.CONDITIONAL:
            throw new Error(
                `Conditional permission profiles are currently not supported on fields, but used in ${sourceType.name}.${sourceField.name}`,
            );
    }

    const targetType = node.relationSide.targetType;
    const entityPermissionDescriptor = getPermissionDescriptorOfRootEntityType(targetType);
    const entityAccess = entityPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (entityAccess) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to read ${targetType.name} objects (in ${sourceType.name}.${sourceField.name})`,
                { code: PERMISSION_DENIED_ERROR },
            );
        default:
            const itemVar = new VariableQueryNode('item');
            const condition = entityPermissionDescriptor.getAccessCondition(
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
