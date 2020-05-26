import { RelationSegment } from '../../model/implementation/collect-path';
import {
    PERMISSION_DENIED_ERROR,
    QueryNode,
    RuntimeErrorQueryNode,
    TraversalQueryNode,
    VariableQueryNode
} from '../../query-tree';
import { AccessOperation, AuthContext } from '../auth-basics';
import { PermissionResult } from '../permission-descriptors';
import {
    getPermissionDescriptorOfField,
    getPermissionDescriptorOfRootEntityType
} from '../permission-descriptors-in-model';

export function transformTraversalQueryNode(node: TraversalQueryNode, authContext: AuthContext): QueryNode {
    const { relationSegments, fieldSegments } = node;

    for (const segment of relationSegments) {
        const targetType = segment.resultingType;
        const entityPermissionDescriptor = getPermissionDescriptorOfRootEntityType(targetType);
        const entityAccess = entityPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
        if (entityAccess === PermissionResult.DENIED) {
            return new RuntimeErrorQueryNode(`Not authorized to read ${targetType.name} objects`, {
                code: PERMISSION_DENIED_ERROR
            });
        }
    }

    for (const segment of [...relationSegments, ...fieldSegments]) {
        const fieldPermissionDescriptor = getPermissionDescriptorOfField(segment.field);
        const access = fieldPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
        switch (access) {
            case PermissionResult.DENIED:
                return new RuntimeErrorQueryNode(
                    `Not authorized to read ${segment.field.declaringType.name}.${segment.field.name}`,
                    { code: PERMISSION_DENIED_ERROR }
                );
            case PermissionResult.CONDITIONAL:
                throw new Error(
                    `Conditional permission profiles are currently not supported on fields, but used in ${segment.field.declaringType.name}.${segment.field.name}`
                );
        }
    }

    let hasAppliedFilter = false;
    const filteredRelationSegments = relationSegments.map(
        (segment): RelationSegment => {
            const targetType = segment.resultingType;
            const entityPermissionDescriptor = getPermissionDescriptorOfRootEntityType(targetType);
            const entityAccess = entityPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
            switch (entityAccess) {
                case PermissionResult.DENIED:
                    throw new Error(`Unexpected DENIED permission - should have been caught earlier`);
                case PermissionResult.CONDITIONAL:
                    const variableNode = new VariableQueryNode(targetType.name);
                    const filter = entityPermissionDescriptor.getAccessCondition(
                        authContext,
                        AccessOperation.READ,
                        variableNode
                    );
                    hasAppliedFilter = true;
                    return {
                        ...segment,
                        vertexFilterVariable: variableNode,
                        vertexFilter: filter
                    };
                default:
                    return segment;
            }
        }
    );
    if (hasAppliedFilter) {
        return new TraversalQueryNode(node.sourceEntityNode, filteredRelationSegments, fieldSegments);
    }

    return node;
}
