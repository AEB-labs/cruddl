import { Field, Multiplicty, Relation, RelationFieldSide } from '../../model';
import {
    AddEdgesQueryNode, EdgeFilter, EdgeIdentifier, EntityFromIdQueryNode, ErrorIfNotTruthyResultValidator,
    LiteralQueryNode, PartialEdgeIdentifier, PreExecQueryParms, QueryNode, RemoveEdgesQueryNode, SetEdgeQueryNode
} from '../../query-tree';
import { AffectedFieldInfoQueryNode, CreateEntityQueryNode } from '../../query-tree/mutations';
import { VariableQueryNode } from '../../query-tree/variables';
import { CreateRootEntityInputType } from '../create-input-types/input-types';
import { PlainObject } from '../../utils/utils';
import { UpdateRootEntityInputType } from '../update-input-types/input-types';

export function getSetEdgeStatements(sourceField: Field, sourceIDNode: QueryNode, targetID: string | null): ReadonlyArray<PreExecQueryParms> {
    const relation = sourceField.getRelationOrThrow();

    if (targetID == undefined) {
        // remove edge
        return [
            new PreExecQueryParms({
                query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                    relation,
                    sourceField,
                    sourceIDNodes: [sourceIDNode]
                }))
            })
        ];
    }

    const otherType = relation.getOtherType(sourceField);

    const targetIDNode = new LiteralQueryNode(targetID);
    const newEdge = getEdgeIdentifier({
        relation,
        sourceIDNode,
        targetIDNode,
        sourceField
    });
    // this one removes existing *outgoing* edges - see the multiplicity check for *incoming* edges of the target
    const existingEdge = getPartialEdgeIdentifier({
        relation,
        sourceIDNode,
        sourceField
    });
    const setEdgeStatement = new PreExecQueryParms({
        query: new SetEdgeQueryNode({
            relation,
            newEdge,
            existingEdge
        })
    });

    // check that target exists
    const targetExistsCheck = new PreExecQueryParms({
        query: new EntityFromIdQueryNode(otherType, targetIDNode),
        resultValidator: new ErrorIfNotTruthyResultValidator(`${otherType.name} with id '${targetID}' does not exist`)
    });

    const targetMultiplicity = relation.getTargetMultiplicity(sourceField);
    if (targetMultiplicity == Multiplicty.ONE) {
        // target should link to at most one source, so we need to remove an edge to the target if exists

        const removeExistingEdgeStatement = new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                relation,
                sourceField: sourceField,
                targetIDNodes: [targetIDNode]
            }))
        });

        return [
            targetExistsCheck,
            removeExistingEdgeStatement,
            setEdgeStatement
        ];
    } else {
        // target can link to many sources, and it can not exist yet (as we are in create mode), so we can just add it
        return [
            targetExistsCheck,
            setEdgeStatement
        ];
    }
}

export function getAddEdgesStatements(sourceField: Field, sourceIDNode: QueryNode, targetIDs: ReadonlyArray<string>) {
    const relation = sourceField.getRelationOrThrow();
    const targetType = relation.getOtherType(sourceField);

    // check that all targets exist
    const targetsExistChecks = targetIDs.map(id => new PreExecQueryParms({
        query: new EntityFromIdQueryNode(targetType, new LiteralQueryNode(id)),
        resultValidator: new ErrorIfNotTruthyResultValidator(`${targetType.name} with id '${id}' does not exist`)
    }));

    const edges = targetIDs.map(id => getEdgeIdentifier({
        relation,
        sourceIDNode,
        targetIDNode: new LiteralQueryNode(id),
        sourceField
    }));
    const addEdgesStatement = new PreExecQueryParms({
        query: new AddEdgesQueryNode(relation, edges)
    });

    const targetMultiplicity = relation.getTargetMultiplicity(sourceField);
    if (targetMultiplicity == Multiplicty.ONE) {
        // target should link to at most one source, so we need to remove an edges to the targets if they exist

        const removeExistingEdgeStatement = new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                relation,
                sourceField,
                targetIDNodes: targetIDs.map(id => new LiteralQueryNode(id))
            }))
        });

        return [
            ...targetsExistChecks,
            removeExistingEdgeStatement,
            addEdgesStatement
        ];
    } else {
        return [
            ...targetsExistChecks,
            addEdgesStatement
        ];
    }
}

export function getCreateAndAddEdgesStatements(sourceField: Field, sourceIDNode: QueryNode, createRootEntityInputType: CreateRootEntityInputType | UpdateRootEntityInputType, createInputs: ReadonlyArray<PlainObject>) {
    const relation = sourceField.getRelationOrThrow();

    const variableQueryNodes : VariableQueryNode[] = [];
    let statements : PreExecQueryParms[] = [];


    createInputs.forEach(createInput => {
        const newEntityIdVarNode = new VariableQueryNode('newEntityId');
        const createStatements = createRootEntityInputType.getCreateStatements(createInput, newEntityIdVarNode);
        variableQueryNodes.push(newEntityIdVarNode);
        statements = [...statements, ...createStatements];
    });

    const edges = variableQueryNodes.map(id => getEdgeIdentifier({
        relation,
        sourceIDNode,
        targetIDNode: id,
        sourceField
    }));

    const addEdgesStatement = new PreExecQueryParms({
        query: new AddEdgesQueryNode(relation, edges)
    });

    return [...statements, addEdgesStatement];
}

export function getRemoveEdgesStatements(sourceField: Field, sourceIDNode: QueryNode, targetIDs: ReadonlyArray<string>): ReadonlyArray<PreExecQueryParms> {
    const relation = sourceField.getRelationOrThrow();
    return [
        new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                relation,
                sourceField,
                sourceIDNodes: [sourceIDNode],
                targetIDNodes: targetIDs.map(id => new LiteralQueryNode(id))
            }))
        })
    ];
}

/**
 * Creates an Edge identifier. Reorders source/target so that they match from/to in the relation
 */
function getEdgeIdentifier(param: { relation: Relation; sourceIDNode: QueryNode; targetIDNode: QueryNode; sourceField: Field }): EdgeIdentifier {
    switch (param.relation.getFieldSide(param.sourceField)) {
        case RelationFieldSide.FROM_SIDE:
            return new EdgeIdentifier(param.sourceIDNode, param.targetIDNode);
        case RelationFieldSide.TO_SIDE:
            return new EdgeIdentifier(param.targetIDNode, param.sourceIDNode);
    }
}

/**
 * Creates a partial edge identifier of the format ?->id or id->?
 */
function getPartialEdgeIdentifier(param: { relation: Relation; sourceIDNode: QueryNode; sourceField: Field }): PartialEdgeIdentifier {
    switch (param.relation.getFieldSide(param.sourceField)) {
        case RelationFieldSide.FROM_SIDE:
            return new PartialEdgeIdentifier(param.sourceIDNode, undefined);
        case RelationFieldSide.TO_SIDE:
            return new PartialEdgeIdentifier(undefined, param.sourceIDNode);
    }
}

/**
 * Creates an Edge filter. Reorders source/target so that they match from/to in the relation
 */
function getEdgeFilter(param: { relation: Relation; sourceIDNodes?: QueryNode[]; targetIDNodes?: QueryNode[]; sourceField: Field }): EdgeFilter {
    switch (param.relation.getFieldSide(param.sourceField)) {
        case RelationFieldSide.FROM_SIDE:
            return new EdgeFilter(param.sourceIDNodes, param.targetIDNodes);
        case RelationFieldSide.TO_SIDE:
            return new EdgeFilter(param.targetIDNodes, param.sourceIDNodes);
    }
}
