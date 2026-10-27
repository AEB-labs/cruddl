import { AggregationOperator } from '../../model/config/field.js';
import type { QueryNode } from '../../query-tree/base.js';
import { PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode } from '../../query-tree/errors.js';
import { AggregationQueryNode, TransformListQueryNode } from '../../query-tree/lists.js';
import type { CreateEntitiesQueryNode } from '../../query-tree/mutations.js';
import { BinaryOperationQueryNode, BinaryOperator } from '../../query-tree/operators.js';
import { PreExecQueryParms, WithPreExecutionQueryNode } from '../../query-tree/pre-exec.js';
import { simplifyBooleans } from '../../query-tree/utils/simplify-booleans.js';
import { ErrorIfNotTruthyResultValidator } from '../../query-tree/validation.js';
import { VariableQueryNode } from '../../query-tree/variables.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model.js';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors.js';

export function transformCreateEntitiesQueryNode(
    node: CreateEntitiesQueryNode,
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
            const objectVar = new VariableQueryNode('object');
            const singleCondition = simplifyBooleans(
                new BinaryOperationQueryNode(
                    permissionDescriptor.getAccessCondition(
                        authContext,
                        AccessOperation.CREATE,
                        objectVar,
                    ),
                    BinaryOperator.AND,
                    permissionDescriptor.getListChangeCondition(
                        authContext,
                        AccessOperation.CREATE,
                        undefined,
                        objectVar,
                    ),
                ),
            );
            const condition = new AggregationQueryNode(
                new TransformListQueryNode({
                    listNode: node.objectsNode,
                    itemVariable: objectVar,
                    innerNode: singleCondition,
                }),
                AggregationOperator.EVERY_TRUE,
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
