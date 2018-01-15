import { getPermissionDescriptor } from '../permission-descriptors-in-schema';
import { AccessOperation, AuthContext } from '../auth-basics';
import {
    BinaryOperationQueryNode, BinaryOperator, ConstIntQueryNode, CountQueryNode, DeleteEntitiesQueryNode,
    EntitiesQueryNode, FieldQueryNode,
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

    const accessGroupField = node.objectType.getFields()['accessGroup'];
    if (!accessGroupField) {
        throw new Error(`Root entity ${node.objectType.name} has an accessGroup-based permission profile, but no accessGroup field`);
    }
    const itemVar = node.currentEntityVariable;
    const accessGroupNode = new FieldQueryNode(itemVar, accessGroupField, node.objectType);

    // If we can't write unconditionally, we might still be able to read unconditionally and wouldn't need a filter
    const readAccess = permissionDescriptor.canAccess(authContext, AccessOperation.READ);
    let readCondition: QueryNode|undefined = undefined;
    if (readAccess != PermissionResult.GRANTED) {
        readCondition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.READ, accessGroupNode);
        const constructor = node.constructor as {new(...a: any[]): UpdateEntitiesQueryNode|DeleteEntitiesQueryNode};
        node = new constructor({...node, filterNode: new BinaryOperationQueryNode(node.filterNode, BinaryOperator.AND, readCondition) });
    }

    // TODO only add a check if the object is readable, but not writeable (only needed if read and write access differ)
    // a check using QueryNode.equals does not work because both use LiteralQueryNodes for the roles, and
    //  LiteralQueryNodes use referential equality instead of structural equality
    // in the general case, structural equality for literal values may not be the best thing for filters

    // see if any entities matched by the filter are write-restricted
    const filterResultVar = new VariableQueryNode('canWrite');
    const rawWriteCondition = permissionDescriptor.getAccessCondition(authContext, AccessOperation.WRITE, accessGroupNode);
    const entitiesWithWriteRestrictions = new TransformListQueryNode({
        itemVariable: node.currentEntityVariable,
        listNode: new EntitiesQueryNode(node.objectType),
        filterNode: new BinaryOperationQueryNode(node.filterNode, BinaryOperator.AND, new UnaryOperationQueryNode(rawWriteCondition, UnaryOperator.NOT))
    });
    const canWrite = new BinaryOperationQueryNode(new CountQueryNode(entitiesWithWriteRestrictions), BinaryOperator.EQUAL, ConstIntQueryNode.ZERO);

    // It would be good to include the accessGroup value in the error message, but this is not possible with the current ErrorIfNotTruthyResultValidator
    return new WithPreExecutionQueryNode({
        resultNode: node,
        preExecQueries: [ new PreExecQueryParms({
            query: canWrite,
            resultVariable: filterResultVar,
            resultValidator: new ErrorIfNotTruthyResultValidator(`Not authorized to ${actionDescription} ${node.objectType.name} objects with this accessGroup`)
        })]
    });
}
