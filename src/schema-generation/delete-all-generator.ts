import { RootEntityType } from '../model';
import {
    DeleteEntitiesQueryNode,
    DeleteEntitiesResultValue,
    EntitiesIdentifierKind,
    PreExecQueryParms,
    QueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode,
} from '../query-tree';
import { mapToIDNodesUnoptimized } from './utils/map';
import { getPreEntityRemovalStatements } from './utils/relations';
import { FieldPath } from '../model/implementation/field-path';

export interface GenerateDeleteAllQueryNodeOptions {
    readonly resultValue?: DeleteEntitiesResultValue;

    /**
     * An array of paths to fields that should be treated as if they were configured with
     * onDelete=CASCADE
     */
    readonly additionalCascadeFields?: ReadonlyArray<FieldPath>;
}

export function generateDeleteAllQueryNode(
    rootEntityType: RootEntityType,
    listNode: QueryNode,
    {
        resultValue = DeleteEntitiesResultValue.OLD_ENTITIES,
        additionalCascadeFields,
    }: GenerateDeleteAllQueryNodeOptions = {},
) {
    if (!rootEntityType.relations.length) {
        return new DeleteEntitiesQueryNode({
            rootEntityType,
            listNode,
            resultValue,
        });
    }

    // collect the ids before the actual delete statements so the lists won't change by the statements
    // (could occur if the filter contains a relation that is deleted by the removesEdgesStatements)
    // note that updateAll does not have this problem because it does not allow to change relations
    // and update does not have the problem because it does not allow to *filter* by relation
    const idsVariable = new VariableQueryNode('ids');
    const idsStatement = new PreExecQueryParms({
        // don't use optimizations here so we actually "see" the entities and don't just return the ids
        // this is relevant if there are accessGroup filters
        query: mapToIDNodesUnoptimized(listNode),
        resultVariable: idsVariable,
    });

    // no preexec for the actual deletion here because we need to evaluate the result while the entity still exists
    // and it won't exist if already deleted in the pre-exec
    const deleteEntitiesNode = new DeleteEntitiesQueryNode({
        rootEntityType,
        listNode: idsVariable,
        entitiesIdentifierKind: EntitiesIdentifierKind.ID,
        resultValue,
    });

    const removeEdgesStatements = getPreEntityRemovalStatements(rootEntityType, idsVariable, {
        additionalCascadeFields,
    });

    return new WithPreExecutionQueryNode({
        preExecQueries: [idsStatement, ...removeEdgesStatements],
        resultNode: deleteEntitiesNode,
    });
}
