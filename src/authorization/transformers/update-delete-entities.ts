import { decapitalize } from '../../utils/utils';
import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext, AUTHORIZATION_ERROR_NAME } from '../auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstIntQueryNode, CountQueryNode, DeleteEntitiesQueryNode,
    EntitiesQueryNode, FieldQueryNode, MergeObjectsQueryNode, ObjectQueryNode,
    PreExecQueryParms, QueryNode, RuntimeErrorQueryNode, TransformListQueryNode, UnaryOperationQueryNode, UnaryOperator,
    UpdateEntitiesQueryNode, VariableQueryNode, WithPreExecutionQueryNode
} from '../../query/definition';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors';
import { ErrorIfNotTruthyResultValidator } from '../../query/query-result-validators';

export function transformUpdateEntitiesQueryNode(node: UpdateEntitiesQueryNode, authContext: AuthContext): QueryNode {
    return transformUpdateOrDeleteEntitiesQueryNode(node, authContext, 'update');
}

export function transformDeleteEntitiesQueryNode(node: DeleteEntitiesQueryNode, authContext: AuthContext): QueryNode {
    return transformUpdateOrDeleteEntitiesQueryNode(node, authContext, 'delete');
}

function transformUpdateOrDeleteEntitiesQueryNode(node: UpdateEntitiesQueryNode|DeleteEntitiesQueryNode, authContext: AuthContext, actionDescription: string): QueryNode {
    const permissionDescriptor = getPermissionDescriptor(node.objectType);
    const access = permissionDescriptor.canAccess(authContext, AccessOperation.WRITE);

    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(`${AUTHORIZATION_ERROR_NAME}: Not authorized to ${actionDescription} ${node.objectType.name} objects`);
        case PermissionResult.GRANTED:
            return node;
    }

    // conditional write access
    // TODO only add a check if the object is readable, but not writable (only needed if read and write access differ)
    // a check using QueryNode.equals does not work because both use LiteralQueryNodes for the roles, and
    // LiteralQueryNodes use referential equality instead of structural equality
    // in the general case, structural equality for literal values may not be the best thing for filters

    // see if any entities matched by the filter are write-restricted
    const listItemVar = new VariableQueryNode(decapitalize(node.objectType.name));
    const rawWriteCondition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, listItemVar);
    const canWrite = getIsTrueInEachItemQueryNode(node.listNode, listItemVar, rawWriteCondition);
    const explanation = permissionDescriptor.getExplanationForCondition(authContext, AccessOperation.WRITE, ConditionExplanationContext.BEFORE_WRITE);
    let preExecQueries: PreExecQueryParms[] = [
        new PreExecQueryParms({
            query: canWrite,
            resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to ${actionDescription} ${explanation}`, AUTHORIZATION_ERROR_NAME)
        })
    ];

    if (node instanceof UpdateEntitiesQueryNode) {
        // this is the most general approach, but also inefficient because it constructs the whole "post-update" objects just to check one field which may not even have been modified
        // TODO add a fast-lane way for PermissionDescriptors to statically check updated values? Or at least to specify that they don't need the merge?
        const updateItemVar = node.currentEntityVariable;
        const postUpdateNode = new MergeObjectsQueryNode([ updateItemVar, new ObjectQueryNode(node.updates) ]); // { ...itemVar, ...{ node.updates... } }
        const writeConditionPostUpdate = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, postUpdateNode);
        const explanation = permissionDescriptor.getExplanationForCondition(authContext, AccessOperation.WRITE, ConditionExplanationContext.SET);
        const canWriteTheseValues = getIsTrueInEachItemQueryNode(node.listNode, updateItemVar, writeConditionPostUpdate);
        preExecQueries.push(new PreExecQueryParms({
            query: canWriteTheseValues,
            resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to ${explanation}`, AUTHORIZATION_ERROR_NAME)
        }));
    }

    return new WithPreExecutionQueryNode({
        resultNode: node,
        preExecQueries
    });
}


function getIsTrueInEachItemQueryNode(listNode: QueryNode, itemVarNode: VariableQueryNode, condition: QueryNode) {
    // items.map(itemVar => !condition(itemVar)).length == 0
    const entitiesWithWriteRestrictions = getFilteredListQueryNode(listNode, itemVarNode, new UnaryOperationQueryNode(condition, UnaryOperator.NOT));
    return new BinaryOperationQueryNode(new CountQueryNode(entitiesWithWriteRestrictions), BinaryOperator.EQUAL, ConstIntQueryNode.ZERO);
}

function getFilteredListQueryNode(listNode: QueryNode, itemVarNode: VariableQueryNode, condition: QueryNode) {
    return new TransformListQueryNode({
        itemVariable: itemVarNode,
        listNode: listNode,
        filterNode: condition
    });
}