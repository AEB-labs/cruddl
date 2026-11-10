import type { QueryNode } from '../../query-tree/base.js';
import { PERMISSION_DENIED_ERROR } from '../../query-tree/errors.js';
import type { CreateEntityQueryNode } from '../../query-tree/mutations.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../../query-tree/operators.js';
import { PreExecQueryParms, WithPreExecutionQueryNode } from '../../query-tree/pre-exec.js';
import { simplifyBooleans } from '../../query-tree/utils/simplify-booleans.js';
import { ErrorIfNotTruthyResultValidator } from '../../query-tree/validation.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import { createPermissionDeniedNode } from '../permission-denial.js';
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
            return createPermissionDeniedNode({
                permissionDescriptor: permissionDescriptor,
                authContext,
                operation: AccessOperation.CREATE,
                typeName: node.rootEntityType.name,
                message: `Not authorized to create ${node.rootEntityType.name} objects`,
            });
        default:
            const condition = simplifyBooleans(
                new BinaryOperationQueryNode(
                    permissionDescriptor.getAccessCondition(
                        authContext,
                        AccessOperation.CREATE,
                        node.objectNode,
                    ),
                    BinaryOperator.AND,
                    permissionDescriptor.getListChangeCondition(
                        authContext,
                        AccessOperation.CREATE,
                        undefined,
                        node.objectNode,
                    ),
                ),
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
                            permissionDenial: {
                                operation: AccessOperation.CREATE,
                                typeName: node.rootEntityType.name,
                            },
                            errorMessage: `Not authorized to ${explanation}`,
                        }),
                    }),
                ],
            });
    }
}
