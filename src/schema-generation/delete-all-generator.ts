import { RootEntityType } from '../model/implementation';
import {
    CountQueryNode,
    DeleteEntitiesQueryNode,
    PreExecQueryParms,
    QueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode
} from '../query-tree';
import { mapIDsToRootEntities, mapTOIDNodesUnoptimized } from './utils/map';
import { getRemoveAllEntityEdgesStatements } from './utils/relations';

export function generateDeleteAllQueryNode(rootEntityType: RootEntityType, listNode: QueryNode) {
    if (!rootEntityType.relations.length) {
        return new CountQueryNode(
            new DeleteEntitiesQueryNode({
                rootEntityType,
                listNode
            })
        );
    }

    // collect the ids before the actual delete statements so the lists won't change by the statements
    // (could occur if the filter contains a relation that is deleted by the removesEdgesStatements)
    // note that updateAll does not have this problem because it does not allow to change relations
    // and update does not have the problem because it does not allow to *filter* by relation
    const idsVariable = new VariableQueryNode('ids');
    const idsStatement = new PreExecQueryParms({
        // don't use optimizations here so we actually "see" the entities and don't just return the ids
        // this is relevant if there are accessGroup filters
        query: mapTOIDNodesUnoptimized(listNode),
        resultVariable: idsVariable
    });
    const entitiesNode = mapIDsToRootEntities(idsVariable, rootEntityType);

    // no preexec for the actual deletion here because we need to evaluate the result while the entity still exists
    // and it won't exist if already deleted in the pre-exec
    const deleteEntitiesNode = new CountQueryNode(
        new DeleteEntitiesQueryNode({
            rootEntityType,
            listNode: entitiesNode
        })
    );

    const removeEdgesStatements = getRemoveAllEntityEdgesStatements(rootEntityType, idsVariable);

    return new WithPreExecutionQueryNode({
        preExecQueries: [idsStatement, ...removeEdgesStatements],
        resultNode: deleteEntitiesNode
    });
}
