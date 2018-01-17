import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    CreateEntityQueryNode, PreExecQueryParms, QueryNode, RuntimeErrorQueryNode, WithPreExecutionQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';
import { ErrorIfNotTruthyResultValidator } from '../../query/query-result-validators';

export function transformCreateEntityQueryNode(node: CreateEntityQueryNode, authContext: AuthContext): QueryNode {
    const permissionDescriptor = getPermissionDescriptor(node.objectType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    switch (access) {
        case PermissionResult.GRANTED:
            return node;
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`Not authorized to create ${node.objectType.name} objects`);
        default:
            const condition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, node.objectNode);
            return new WithPreExecutionQueryNode({
                resultNode: node,
                preExecQueries: [ new PreExecQueryParms({
                    query: condition,
                    resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to create ${node.objectType.name} objects with these values`, 'AuthorizationError')
                })]
            });
    }
}
