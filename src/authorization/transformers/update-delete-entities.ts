import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstIntQueryNode, CountQueryNode, DeleteEntitiesQueryNode,
    EntitiesQueryNode, FieldQueryNode, MergeObjectsQueryNode, ObjectQueryNode,
    PreExecQueryParms, QueryNode, RuntimeErrorQueryNode, TransformListQueryNode, UnaryOperationQueryNode, UnaryOperator,
    UpdateEntitiesQueryNode, VariableQueryNode, WithPreExecutionQueryNode
} from '../../query/definition';
import { PermissionResult } from '../permission-descriptors';
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
            return new RuntimeErrorQueryNode(`Not authorized to ${actionDescription} ${node.objectType.name} objects`);
        case PermissionResult.GRANTED:
            return node;
    }

    // conditional access
    const itemVar = node.currentEntityVariable;

    // If we can't write unconditionally, we might still be able to read unconditionally and wouldn't need a filter
    const readAccess = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    let readCondition: QueryNode|undefined = undefined;
    if (readAccess != PermissionResult.GRANTED) {
        readCondition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, itemVar);
        const constructor = node.constructor as {new(...a: any[]): UpdateEntitiesQueryNode|DeleteEntitiesQueryNode};
        node = new constructor({...node, filterNode: new BinaryOperationQueryNode(node.filterNode, BinaryOperator.AND, readCondition) });
    }

    function getNoneMatchesQueryNode(condition: QueryNode) {
        const entitiesWithWriteRestrictions = new TransformListQueryNode({
            itemVariable: node.currentEntityVariable,
            listNode: new EntitiesQueryNode(node.objectType),
            filterNode: new BinaryOperationQueryNode(node.filterNode, BinaryOperator.AND, new UnaryOperationQueryNode(condition, UnaryOperator.NOT))
        });
        return new BinaryOperationQueryNode(new CountQueryNode(entitiesWithWriteRestrictions), BinaryOperator.EQUAL, ConstIntQueryNode.ZERO);
    }

    // TODO only add a check if the object is readable, but not writable (only needed if read and write access differ)
    // a check using QueryNode.equals does not work because both use LiteralQueryNodes for the roles, and
    // LiteralQueryNodes use referential equality instead of structural equality
    // in the general case, structural equality for literal values may not be the best thing for filters

    // see if any entities matched by the filter are write-restricted
    const rawWriteCondition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, itemVar);
    const canWrite = getNoneMatchesQueryNode(rawWriteCondition);

    // TODO add better error messages, maybe a static message from the PermissionDescriptor?

    let preExecQueries: PreExecQueryParms[] = [
        new PreExecQueryParms({
            query: canWrite,
            resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to ${actionDescription} this ${node.objectType.name}`, 'AuthorizationError')
        })
    ];

    if (node instanceof UpdateEntitiesQueryNode) {
        // this is the most general approach, but also inefficient because it constructs the whole "post-update" objects just to check one field which may not even have been modified
        // TODO add a fast-lane way for PermissionDescriptors to statically check updated values? Or at least to specify that they don't need the merge?
        const postUpdateNode = new MergeObjectsQueryNode([ itemVar, new ObjectQueryNode(node.updates) ]);
        const writeConditionPostUpdate = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, postUpdateNode);
        const canWriteTheseValues = getNoneMatchesQueryNode(writeConditionPostUpdate);
        preExecQueries.push(new PreExecQueryParms({
            query: canWriteTheseValues,
            resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to ${actionDescription} this ${node.objectType.name} with these values`, 'AuthorizationError')
        }));
    }

    return new WithPreExecutionQueryNode({
        resultNode: node,
        preExecQueries
    });
}
