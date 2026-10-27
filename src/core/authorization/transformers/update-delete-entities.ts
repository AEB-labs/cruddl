import type { Field } from '../../model/implementation/field.js';
import type { QueryNode } from '../../query-tree/base.js';
import { PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode } from '../../query-tree/errors.js';
import { CountQueryNode, TransformListQueryNode } from '../../query-tree/lists.js';
import { ConstBoolQueryNode, ConstIntQueryNode } from '../../query-tree/literals.js';
import {
    DeleteEntitiesQueryNode,
    EntitiesIdentifierKind,
    SetFieldQueryNode,
    UpdateEntitiesQueryNode,
} from '../../query-tree/mutations.js';
import { MergeObjectsQueryNode, ObjectQueryNode } from '../../query-tree/objects.js';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    UnaryOperationQueryNode,
    UnaryOperator,
} from '../../query-tree/operators.js';
import { PreExecQueryParms, WithPreExecutionQueryNode } from '../../query-tree/pre-exec.js';
import { EntityFromIdQueryNode } from '../../query-tree/queries.js';
import { ErrorIfNotTruthyResultValidator } from '../../query-tree/validation.js';
import { VariableAssignmentQueryNode, VariableQueryNode } from '../../query-tree/variables.js';
import { decapitalize } from '../../utils/utils.js';
import type { AuthContext } from '../auth-basics.js';
import { AccessOperation } from '../auth-basics.js';
import { getPermissionDescriptorOfRootEntityType } from '../permission-descriptors-in-model.js';
import { ConditionExplanationContext, PermissionResult } from '../permission-descriptors.js';

type Action = 'update' | 'delete';

export function transformUpdateEntitiesQueryNode(
    node: UpdateEntitiesQueryNode,
    authContext: AuthContext,
): QueryNode {
    return transformUpdateOrDeleteEntitiesQueryNode(node, authContext, AccessOperation.UPDATE);
}

export function transformDeleteEntitiesQueryNode(
    node: DeleteEntitiesQueryNode,
    authContext: AuthContext,
): QueryNode {
    return transformUpdateOrDeleteEntitiesQueryNode(node, authContext, AccessOperation.DELETE);
}

function transformUpdateOrDeleteEntitiesQueryNode(
    node: UpdateEntitiesQueryNode | DeleteEntitiesQueryNode,
    authContext: AuthContext,
    operation: AccessOperation.UPDATE | AccessOperation.DELETE,
): QueryNode {
    const actionDescription = operation === AccessOperation.UPDATE ? 'update' : 'delete';
    const permissionDescriptor = getPermissionDescriptorOfRootEntityType(node.rootEntityType);
    const access = permissionDescriptor.canAccess(authContext, operation);

    switch (access) {
        case PermissionResult.DENIED:
            return new RuntimeErrorQueryNode(
                `Not authorized to ${actionDescription} ${node.rootEntityType.name} objects`,
                { code: PERMISSION_DENIED_ERROR },
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
    let entityNode: QueryNode = listItemVar;
    if (
        node instanceof DeleteEntitiesQueryNode &&
        node.entitiesIdentifierKind === EntitiesIdentifierKind.ID
    ) {
        entityNode = new EntityFromIdQueryNode(node.rootEntityType, listItemVar);
    }
    const rawWriteCondition = permissionDescriptor.getAccessCondition(
        authContext,
        operation,
        entityNode,
    );
    const canWrite = getIsTrueInEachItemQueryNode(node.listNode, listItemVar, rawWriteCondition);
    const explanation = permissionDescriptor.getExplanationForCondition(
        authContext,
        operation,
        ConditionExplanationContext.BEFORE_WRITE,
    );
    let preExecQueries: PreExecQueryParms[] = [
        new PreExecQueryParms({
            query: canWrite,
            resultValidator: new ErrorIfNotTruthyResultValidator({
                errorCode: PERMISSION_DENIED_ERROR,
                errorMessage: `Not authorized to ${actionDescription} ${explanation}`,
            }),
        }),
    ];

    // if we're updating, check if we would be able to update the objects after we changed them
    // this prevents users with access-group-restricted permissions on an object from updating the accessGroup field to
    // a value that they don't have update permission on
    if (node instanceof UpdateEntitiesQueryNode) {
        // this is the most general approach, but also inefficient because it constructs the whole "post-update" objects just to check one field which may not even have been modified
        // TODO add a fast-lane way for PermissionDescriptors to statically check updated values? Or at least to specify that they don't need the merge?
        const updateItemVar = node.currentEntityVariable;
        const postUpdateNode = new MergeObjectsQueryNode([
            updateItemVar,
            new ObjectQueryNode(node.updates),
        ]); // { ...itemVar, ...{ node.updates... } }
        const postUpdateVar = new VariableQueryNode('postUpdate');
        // list fields in restrictions only need one matching item, so we additionally need to check that the
        // user is allowed to add / remove the list items that are changed
        const listChangeCondition = permissionDescriptor.getListChangeCondition(
            authContext,
            operation,
            updateItemVar,
            postUpdateVar,
            (fields) => isFieldPathAffectedByUpdates(fields, node.updates),
        );
        let writeConditionPostUpdate: QueryNode;
        if (listChangeCondition instanceof ConstBoolQueryNode && listChangeCondition.value) {
            writeConditionPostUpdate = permissionDescriptor.getAccessCondition(
                authContext,
                operation,
                postUpdateNode,
            );
        } else {
            // assign the post-update object to a variable because it's used multiple times
            writeConditionPostUpdate = new VariableAssignmentQueryNode({
                variableNode: postUpdateVar,
                variableValueNode: postUpdateNode,
                resultNode: new BinaryOperationQueryNode(
                    permissionDescriptor.getAccessCondition(authContext, operation, postUpdateVar),
                    BinaryOperator.AND,
                    listChangeCondition,
                ),
            });
        }
        const explanation = permissionDescriptor.getExplanationForCondition(
            authContext,
            operation,
            ConditionExplanationContext.SET,
        );
        const canWriteTheseValues = getIsTrueInEachItemQueryNode(
            node.listNode,
            updateItemVar,
            writeConditionPostUpdate,
        );
        preExecQueries.push(
            new PreExecQueryParms({
                query: canWriteTheseValues,
                resultValidator: new ErrorIfNotTruthyResultValidator({
                    errorCode: PERMISSION_DENIED_ERROR,
                    errorMessage: `Not authorized to ${explanation}`,
                }),
            }),
        );
    }

    return new WithPreExecutionQueryNode({
        resultNode: node,
        preExecQueries,
    });
}

function getIsTrueInEachItemQueryNode(
    listNode: QueryNode,
    itemVarNode: VariableQueryNode,
    condition: QueryNode,
) {
    // items.map(itemVar => !condition(itemVar)).length == 0
    const entitiesWithWriteRestrictions = getFilteredListQueryNode(
        listNode,
        itemVarNode,
        new UnaryOperationQueryNode(condition, UnaryOperator.NOT),
    );
    return new BinaryOperationQueryNode(
        new CountQueryNode(entitiesWithWriteRestrictions),
        BinaryOperator.EQUAL,
        ConstIntQueryNode.ZERO,
    );
}

function getFilteredListQueryNode(
    listNode: QueryNode,
    itemVarNode: VariableQueryNode,
    condition: QueryNode,
) {
    return new TransformListQueryNode({
        itemVariable: itemVarNode,
        listNode: listNode,
        filterNode: condition,
    });
}

/**
 * Determines whether the given updates might change the value at the given field path
 */
function isFieldPathAffectedByUpdates(
    fields: ReadonlyArray<Field>,
    updates: ReadonlyArray<SetFieldQueryNode>,
): boolean {
    const [field, ...remainingFields] = fields;
    const update = updates.find((u) => u.field === field);
    if (!update) {
        return false;
    }
    if (!remainingFields.length) {
        return true;
    }

    // entity extensions are updated via a merge of the current value with the updated fields
    if (update.valueNode instanceof MergeObjectsQueryNode) {
        const nestedUpdates = update.valueNode.objectNodes
            .filter((n): n is ObjectQueryNode => n instanceof ObjectQueryNode)
            .flatMap((n) => n.properties)
            .filter((p): p is SetFieldQueryNode => p instanceof SetFieldQueryNode);
        const hasOtherNodes = update.valueNode.objectNodes.some(
            (n, index) => index > 0 && !(n instanceof ObjectQueryNode),
        );
        if (!hasOtherNodes) {
            return isFieldPathAffectedByUpdates(remainingFields, nestedUpdates);
        }
    }

    // value objects are replaced as a whole
    return true;
}
