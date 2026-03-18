import type { QueryNode } from '../../query-tree/base.js';
import { PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode } from '../../query-tree/errors.js';
import type { AffectedFieldInfoQueryNode } from '../../query-tree/mutations.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import { getPermissionDescriptorOfField } from '../permission-descriptors-in-model.js';
import { PermissionResult } from '../permission-descriptors.js';

export function transformAffectedFieldInfoQueryNode(
    node: AffectedFieldInfoQueryNode,
    authContext: AuthContext,
): QueryNode {
    const permissionDescriptor = getPermissionDescriptorOfField(node.field);
    // currently, we don't distinguish between CREATE and UPDATE on field permissions. The `readWrite` argument on
    // the @roles directive grants both, and we only check for UPDATE here. Permission profiles can currently not be
    // used on fields. Once we do, we might want to distinguish. However, the permission system might not be the right
    // place to make a field "immutable" - is it really a use case that someone can create objects and set a field on
    // them, but can't update it - and some other use can update it?
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.UPDATE);
    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to set ${node.field.declaringType.name}.${node.field.name}`,
                { code: PERMISSION_DENIED_ERROR },
            );
        case PermissionResult.CONDITIONAL:
            throw new Error(
                `Conditional permission profiles are currently not supported on fields, but used in ${node.field.declaringType.name}.${node.field.name}`,
            );
    }

    // note that there is no need to handle the accessGroup in a specific way
    // update-delete-entities.ts makes sure it's not set to an invalid value.

    return node;
}
