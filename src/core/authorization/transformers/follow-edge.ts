import type { QueryNode } from '../../query-tree/base.js';
import { TransformListQueryNode } from '../../query-tree/lists.js';
import type { FollowEdgeQueryNode } from '../../query-tree/queries.js';
import { VariableQueryNode } from '../../query-tree/variables.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import { createPermissionDeniedNode } from '../permission-denial.js';
import {
    getPermissionDescriptorOfField,
    getPermissionDescriptorOfRootEntityType,
} from '../permission-descriptors-in-model.js';
import { PermissionResult } from '../permission-descriptors.js';

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
            return createPermissionDeniedNode({
                permissionDescriptor: fieldPermissionDescriptor,
                authContext,
                operation: AccessOperation.READ,
                typeName: sourceType.name,
                fieldName: sourceField.name,
                message: `Not authorized to read ${sourceType.name}.${sourceField.name}`,
            });
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
            return createPermissionDeniedNode({
                permissionDescriptor: entityPermissionDescriptor,
                authContext,
                operation: AccessOperation.READ,
                typeName: targetType.name,
                message: `Not authorized to read ${targetType.name} objects (in ${sourceType.name}.${sourceField.name})`,
            });
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
