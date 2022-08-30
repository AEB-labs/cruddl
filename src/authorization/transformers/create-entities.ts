import { AggregationOperator } from '../../model';
import {
    AggregationQueryNode,
    CreateEntitiesQueryNode,
    ErrorIfNotTruthyResultValidator,
    PERMISSION_DENIED_ERROR,
    PreExecQueryParms,
    QueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode,
} from '../../query-tree';
import { AccessOperation, AuthContext } from '../auth-basics';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';

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
            const singleCondition = permissionDescriptor.getAccessCondition(
                authContext,
                AccessOperation.CREATE,
                objectVar,
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
