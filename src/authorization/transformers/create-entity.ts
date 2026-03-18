import type { QueryNode } from '../../query-tree/base.js';
import { PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode } from '../../query-tree/errors.js';
import type { CreateEntityQueryNode } from '../../query-tree/mutations.js';
import { PreExecQueryParms, WithPreExecutionQueryNode } from '../../query-tree/pre-exec.js';
import { ErrorIfNotTruthyResultValidator } from '../../query-tree/validation.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model.js';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors.js';

export function transformCreateEntityQueryNode(
    node: CreateEntityQueryNode,
    authContext: AuthContext,
): QueryNode {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.CREATE);

    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to create ${node.rootEntityType.name} objects`,
                {
                    code: PERMISSION_DENIED_ERROR,
                },
            );
        default:
            const condition = permissionDescriptor.getAccessCondition(
                authContext,
                AccessOperation.CREATE,
                node.objectNode,
            );
            const explanation = permissionDescriptor.getExplanationForCondition(
                authContext,
                AccessOperation.CREATE,
                ConditionExplanationContext.SET,
            );
            return new WithPreExecutionQueryNode({
                resultNode: node,
                preExecQueries: [
                    new PreExecQueryParms({
                        query: condition,
                        resultValidator: new ErrorIfNotTruthyResultValidator({
                            errorCode: PERMISSION_DENIED_ERROR,
                            errorMessage: `Not authorized to ${explanation}`,
                        }),
                    }),
                ],
            });
    }
}
