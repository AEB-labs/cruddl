import {
    CreateEntityQueryNode, ErrorIfNotTruthyResultValidator, PreExecQueryParms, QueryNode, RuntimeErrorQueryNode,
    WithPreExecutionQueryNode
} from '../../query-tree';
import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';

export function transformCreateEntityQueryNode(node: CreateEntityQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to create ${node.rootEntityType.name} objects`);
        default:
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, node.objectNode);
            const explanation = permissionDescriptor.getExplanationForCondition(authContext, AccessOperation.WRITE, ConditionExplanationContext.SET);
            return new WithPreExecutionQueryNode({
                resultNode: node,
                preExecQueries: [ new PreExecQueryParms({
                    query: condition,
                    resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to ${explanation}`, AUTHORIZATION_ERROR_NAME)
                })]
            });
    }
}
