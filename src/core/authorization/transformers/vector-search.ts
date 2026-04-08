import type { QueryNode } from '../../query-tree/base.js';
import { PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode } from '../../query-tree/errors.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../../query-tree/operators.js';
import { VectorSearchQueryNode } from '../../query-tree/vector-search.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import {
    getPermissionDescriptorOfField,
    getPermissionDescriptorOfRootEntityType,
} from '../permission-descriptors-in-model.js';
import { PermissionResult } from '../permission-descriptors.js';

export function transformVectorSearchQueryNode(
    node: VectorSearchQueryNode,
    authContext: AuthContext,
): QueryNode {
    const { rootEntityType } = node;

    // Check entity-level permissions
    const entityPermissionDescriptor = getPermissionDescriptorOfRootEntityType(rootEntityType);
    const entityAccess = entityPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    if (entityAccess === PermissionResult.DENIED) {
        return new RuntimeErrorQueryNode(`Not authorized to read ${rootEntityType.name} objects`, {
            code: PERMISSION_DENIED_ERROR,
        });
    }

    // Check field-level permissions on the vector index field
    const fieldPermissionDescriptor = getPermissionDescriptorOfField(node.field);
    const fieldAccess = fieldPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    if (fieldAccess === PermissionResult.DENIED) {
        return new RuntimeErrorQueryNode(
            `Not authorized to read ${node.field.declaringType.name}.${node.field.name}`,
            { code: PERMISSION_DENIED_ERROR },
        );
    }

    // Handle conditional (data-dependent) permissions by injecting filter
    if (entityAccess === PermissionResult.CONDITIONAL) {
        const condition = entityPermissionDescriptor.getAccessCondition(
            authContext,
            AccessOperation.READ,
            node.itemVariable,
        );
        return new VectorSearchQueryNode({
            rootEntityType: node.rootEntityType,
            field: node.field,
            vectorNode: node.vectorNode,
            nProbe: node.nProbe,
            minScore: node.minScore,
            maxDistance: node.maxDistance,
            filterNode: new BinaryOperationQueryNode(
                node.filterNode,
                BinaryOperator.AND,
                condition,
            ),
            itemVariable: node.itemVariable,
            innerNode: node.innerNode,
            skipNode: node.skipNode,
            maxCountNode: node.maxCountNode,
        });
    }

    return node;
}
