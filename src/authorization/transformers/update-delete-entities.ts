import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstIntQueryNode,
    CountQueryNode,
    DeleteEntitiesQueryNode,
    ErrorIfNotTruthyResultValidator,
    MergeObjectsQueryNode,
    ObjectQueryNode,
    PERMISSION_DENIED_ERROR,
    PreExecQueryParms,
    QueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    UnaryOperationQueryNode,
    UnaryOperator,
    UpdateEntitiesQueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode
} from '../../query-tree';
import { decapitalize } from '../../utils/utils';
import { AccessOperation, AuthContext } from '../auth-basics';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model';

type Action = 'update' | 'delete';

export function transformUpdateEntitiesQueryNode(node: UpdateEntitiesQueryNode, authContext: AuthContext): QueryNode {
    return transformUpdateOrDeleteEntitiesQueryNode(node, authContext, AccessOperation.UPDATE);
}

export function transformDeleteEntitiesQueryNode(node: DeleteEntitiesQueryNode, authContext: AuthContext): QueryNode {
    return transformUpdateOrDeleteEntitiesQueryNode(node, authContext, AccessOperation.DELETE);
}

function transformUpdateOrDeleteEntitiesQueryNode(
    node: UpdateEntitiesQueryNode | DeleteEntitiesQueryNode,
    authContext: AuthContext,
    operation: AccessOperation.UPDATE | AccessOperation.DELETE
): QueryNode {
    const actionDescription = operation === AccessOperation.UPDATE ? 'update' : 'delete';
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, operation);

    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to ${actionDescription} ${node.rootEntityType.name} objects`,
                { code: PERMISSION_DENIED_ERROR }
            );
        case PermissionResult.GRANTED:
            return node;
    }

    // conditional write access
    // TODO only add a check if the object is readable, but not writable (only needed if read and write access differ)
    // a check using QueryNode.equals does not work because both use LiteralQueryNodes for the roles, and
    // LiteralQueryNodes use referential equality instead of structural equality
    // in the general case, structural equality for literal values may not be the best thing for filters

    // see if any entities matched by the filter are write-restricted
    const listItemVar = new VariableQueryNode(decapitalize(node.rootEntityType.name));
    const rawWriteCondition = permissionDescriptor.getAccessCondition(authContext, operation, listItemVar);
    const canWrite = getIsTrueInEachItemQueryNode(node.listNode, listItemVar, rawWriteCondition);
    const explanation = permissionDescriptor.getExplanationForCondition(
        authContext,
        operation,
        ConditionExplanationContext.BEFORE_WRITE
    );
    let preExecQueries: PreExecQueryParms[] = [
        new PreExecQueryParms({
            query: canWrite,
            resultValidator: new ErrorIfNotTruthyResultValidator({
                errorCode: PERMISSION_DENIED_ERROR,
                errorMessage: `Not authorized to ${actionDescription} ${explanation}`
            })
        })
    ];

    // if we're updating, check if we would be able to update the objects after we changed them
    // this prevents users with access-group-restricted permissions on an object from updating the accessGroup field to
    // a value that they don't have update permission on
    if (node instanceof UpdateEntitiesQueryNode) {
        // this is the most general approach, but also inefficient because it constructs the whole "post-update" objects just to check one field which may not even have been modified
        // TODO add a fast-lane way for PermissionDescriptors to statically check updated values? Or at least to specify that they don't need the merge?
        const updateItemVar = node.currentEntityVariable;
        const postUpdateNode = new MergeObjectsQueryNode([updateItemVar, new ObjectQueryNode(node.updates)]); // { ...itemVar, ...{ node.updates... } }
        const writeConditionPostUpdate = permissionDescriptor.getAccessCondition(
            authContext,
            operation,
            postUpdateNode
        );
        const explanation = permissionDescriptor.getExplanationForCondition(
            authContext,
            operation,
            ConditionExplanationContext.SET
        );
        const canWriteTheseValues = getIsTrueInEachItemQueryNode(
            node.listNode,
            updateItemVar,
            writeConditionPostUpdate
        );
        preExecQueries.push(
            new PreExecQueryParms({
                query: canWriteTheseValues,
                resultValidator: new ErrorIfNotTruthyResultValidator({
                    errorCode: PERMISSION_DENIED_ERROR,
                    errorMessage: `Not authorized to ${explanation}`
                })
            })
        );
    }

    return new WithPreExecutionQueryNode({
        resultNode: node,
        preExecQueries
    });
}

function getIsTrueInEachItemQueryNode(listNode: QueryNode, itemVarNode: VariableQueryNode, condition: QueryNode) {
    // items.map(itemVar => !condition(itemVar)).length == 0
    const entitiesWithWriteRestrictions = getFilteredListQueryNode(
        listNode,
        itemVarNode,
        new UnaryOperationQueryNode(condition, UnaryOperator.NOT)
    );
    return new BinaryOperationQueryNode(
        new CountQueryNode(entitiesWithWriteRestrictions),
        BinaryOperator.EQUAL,
        ConstIntQueryNode.ZERO
    );
}

function getFilteredListQueryNode(listNode: QueryNode, itemVarNode: VariableQueryNode, condition: QueryNode) {
    return new TransformListQueryNode({
        itemVariable: itemVarNode,
        listNode: listNode,
        filterNode: condition
    });
}
