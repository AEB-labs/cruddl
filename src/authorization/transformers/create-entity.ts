import { CreateEntityQueryNode, ErrorIfNotTruthyResultValidator, PERMISSION_DENIED_ERROR, PreExecQueryParms, QueryNode, RuntimeErrorQueryNode, WithPreExecutionQueryNode } from '../../query-tree';
import { AccessOperation, AuthContext } from '../auth-basics';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';

export function transformCreateEntityQueryNode(node: CreateEntityQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to create ${node.rootEntityType.name} objects`, { code: PERMISSION_DENIED_ERROR });
        default:
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, node.objectNode);
            const explanation = permissionDescriptor.getExplanationForCondition(authContext, AccessOperation.WRITE, ConditionExplanationContext.SET);
            return new WithPreExecutionQueryNode({
                resultNode: node,
                preExecQueries: [
                    new PreExecQueryParms({
                        query: condition,
                        resultValidator: new ErrorIfNotTruthyResultValidator({
                            errorCode: PERMISSION_DENIED_ERROR,
                            errorMessage: `Not authorized to ${explanation}`
                        })
                    })
                ]
            });
    }
}
