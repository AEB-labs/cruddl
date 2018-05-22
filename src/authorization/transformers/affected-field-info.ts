import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
import { AffectedFieldInfoQueryNode, QueryNode, RuntimeErrorQueryNode } from '../../query-tree';
import { PermissionResult } from '../permission-descriptors';
import { ACCESS_GROUP_FIELD } from '../../schema/schema-defaults';
import {
    getPermissionDescriptorOfField, getPermissionDescriptorOfRootEntityType
} from '../permission-descriptors-in-model';

export function transformAffectedFieldInfoQueryNode(node: AffectedFieldInfoQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptorOfField(node.field);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);
    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to set ${node.field.declaringType.name}.${node.field.name}`);
        case PermissionResult.CONDITIONAL:
            throw new Error(`Conditional permission profiles are currently not supported on fields, but used in ${node.field.declaringType.name}.${node.field.name}`);
    }

    // check if this is setting the accessGroup
    if (node.field.name == ACCESS_GROUP_FIELD && node.field.type.isRootEntityType) {
        const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.field.type);
        // TODO add PreExecQuery to check the new value
    }

    return node;
}
