import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
import {
    FollowEdgeQueryNode, QueryNode, RuntimeErrorQueryNode, TransformListQueryNode, VariableQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';
import { invertRelationFieldEdgeSide } from '../../schema/edges';
import {
    getPermissionDescriptorOfField, getPermissionDescriptorOfRootEntityType
} from '../permission-descriptors-in-model';

export function transformFollowEdgeQueryNode(node: FollowEdgeQueryNode, authContext: AuthContext): QueryNode {
    const sourceType = node.edgeType.getTypeOfSide(node.sourceFieldSide);
    const sourceField = node.edgeType.getFieldOfSide(node.sourceFieldSide);
    if (!sourceField) {
        throw new Error(`Encountered FollowEdgeQueryNode which traverses via non-existing inverse field (on ${sourceType.name})`);
    }
    const fieldPermissionDescriptor = getPermissionDescriptorOfField(sourceField);
    const access = fieldPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to read ${sourceType.name}.${sourceField.name}`);
        case PermissionResult.CONDITIONAL:
            throw new Error(`Conditional permission profiles are currently not supported on fields, but used in ${sourceType.name}.${sourceField.name}`);
    }

    const targetType = node.edgeType.getTypeOfSide(invertRelationFieldEdgeSide(node.sourceFieldSide));
    const entityPermissionDescriptor = getPermissionDescriptorOfRootEntityType(targetType);
    const entityAccess = entityPermissionDescriptor.canAccess(authContext, AccessOperation.READ);
    switch (entityAccess) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to read ${targetType.name} objects (in ${sourceType.name}.${sourceField.name})`);
        default:
            const itemVar = new VariableQueryNode('item');
            const condition = entityPermissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, itemVar);
            return new TransformListQueryNode({
                listNode: node,
                filterNode: condition,
                itemVariable: itemVar
            });
    }
}
