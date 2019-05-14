import { Field, Multiplicity, RelationSide, RootEntityType } from '../../model';
import { AddEdgesQueryNode, EdgeFilter, EdgeIdentifier, EntityFromIdQueryNode, ErrorIfNotTruthyResultValidator, ListQueryNode, LiteralQueryNode, PartialEdgeIdentifier, PreExecQueryParms, QueryNode, RemoveEdgesQueryNode, SetEdgeQueryNode, VariableQueryNode } from '../../query-tree';
import { PlainObject } from '../../utils/utils';
import { CreateRootEntityInputType } from '../create-input-types';
import { FieldContext } from '../query-node-object-type';

/**
 * Gets a statement that moves deletes existing outgoing edges and creates a new one, but does not check existing
 * incoming edges of the target
 */
function getNonCheckingSetEdgeStatement(sourceField: Field, sourceIDNode: QueryNode, targetIDNode: QueryNode): PreExecQueryParms {
    const relationSide = sourceField.getRelationSideOrThrow();
    const newEdge = getEdgeIdentifier({
        relationSide,
        sourceIDNode,
        targetIDNode
    });
    // this one removes existing *outgoing* edges - see the multiplicity check for *incoming* edges of the target
    const existingEdge = getPartialEdgeIdentifier({
        relationSide,
        sourceIDNode
    });
    return new PreExecQueryParms({
        query: new SetEdgeQueryNode({
            relation: relationSide.relation,
            newEdge,
            existingEdge
        })
    });
}

export function getSetEdgeStatements(sourceField: Field, sourceIDNode: QueryNode, targetID: string | null): ReadonlyArray<PreExecQueryParms> {
    const relationSide = sourceField.getRelationSideOrThrow();

    if (targetID == undefined) {
        // remove edge
        return [
            new PreExecQueryParms({
                query: new RemoveEdgesQueryNode(relationSide.relation, getEdgeFilter({
                    relationSide,
                    sourceIDsNode: new ListQueryNode([sourceIDNode])
                }))
            })
        ];
    }

    const targetType = relationSide.otherSide.sourceType;

    const targetIDNode = new LiteralQueryNode(targetID);
    const setEdgeStatement = getNonCheckingSetEdgeStatement(sourceField, sourceIDNode, targetIDNode);

    // check that target exists
    const targetExistsCheck = new PreExecQueryParms({
        query: new EntityFromIdQueryNode(targetType, targetIDNode),
        resultValidator: new ErrorIfNotTruthyResultValidator(`${targetType.name} with id '${targetID}' does not exist`)
    });

    if (relationSide.targetMultiplicity == Multiplicity.ONE) {
        // target should link to at most one source, so we need to remove an edge to the target if exists

        const removeExistingEdgeStatement = new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(relationSide.relation, getEdgeFilter({
                relationSide,
                targetIDsNode: new ListQueryNode([targetIDNode])
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
    const relationSide = sourceField.getRelationSideOrThrow();

    // check that all targets exist
    const targetsExistChecks = targetIDs.map(id => new PreExecQueryParms({
        query: new EntityFromIdQueryNode(relationSide.targetType, new LiteralQueryNode(id)),
        resultValidator: new ErrorIfNotTruthyResultValidator(`${relationSide.targetType.name} with id '${id}' does not exist`)
    }));

    const edges = targetIDs.map(id => getEdgeIdentifier({
        relationSide,
        sourceIDNode,
        targetIDNode: new LiteralQueryNode(id)
    }));
    const addEdgesStatement = new PreExecQueryParms({
        query: new AddEdgesQueryNode(relationSide.relation, edges)
    });

    if (relationSide.targetMultiplicity === Multiplicity.ONE) {
        // target should link to at most one source, so we need to remove an edges to the targets if they exist

        const removeExistingEdgeStatement = new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(relationSide.relation, getEdgeFilter({
                relationSide,
                targetIDsNode: new LiteralQueryNode(targetIDs)
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

export function getCreateAndAddEdgesStatements(sourceField: Field, sourceIDNode: QueryNode, createRootEntityInputType: CreateRootEntityInputType, createInputs: ReadonlyArray<PlainObject>, context: FieldContext) {
    const relationSide = sourceField.getRelationSideOrThrow();

    const variableQueryNodes: VariableQueryNode[] = [];
    let statements: PreExecQueryParms[] = [];

    createInputs.forEach(createInput => {
        const newEntityIdVarNode = new VariableQueryNode('newEntityId');
        const createStatements = createRootEntityInputType.getCreateStatements(createInput, newEntityIdVarNode, context);
        variableQueryNodes.push(newEntityIdVarNode);
        statements = [...statements, ...createStatements];
    });

    const edges = variableQueryNodes.map(id => getEdgeIdentifier({
        relationSide,
        sourceIDNode,
        targetIDNode: id
    }));

    const addEdgesStatement = new PreExecQueryParms({
        query: new AddEdgesQueryNode(relationSide.relation, edges)
    });

    return [...statements, addEdgesStatement];
}

export function getCreateAndSetEdgeStatements(sourceField: Field, sourceIDNode: QueryNode, createRootEntityInputType: CreateRootEntityInputType, createInput: PlainObject, context: FieldContext): ReadonlyArray<PreExecQueryParms> {
    const newEntityIdVarNode = new VariableQueryNode('newEntityId');
    const createStatements = createRootEntityInputType.getCreateStatements(createInput, newEntityIdVarNode, context);
    const setEdgeStatement = getNonCheckingSetEdgeStatement(sourceField, sourceIDNode, newEntityIdVarNode);
    return [...createStatements, setEdgeStatement];
}

export function getRemoveEdgesStatements(sourceField: Field, sourceIDNode: QueryNode, targetIDs: ReadonlyArray<string>): ReadonlyArray<PreExecQueryParms> {
    const relationSide = sourceField.getRelationSideOrThrow();
    return [
        new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(relationSide.relation, getEdgeFilter({
                relationSide,
                sourceIDsNode: new ListQueryNode([sourceIDNode]),
                targetIDsNode: new LiteralQueryNode(targetIDs)
            }))
        })
    ];
}

/**
 * Gets statements that collectively remove any incoming or outgoing edges of the given root entities
 */
export function getRemoveAllEntityEdgesStatements(sourceType: RootEntityType, sourceIDsNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
    return sourceType.relationSides.map(relationSide => getRemoveAllEdgesStatements(relationSide, sourceIDsNode));
}

/**
 * Get a statement that removes all edges in a relation related to the given root entities
 */
export function getRemoveAllEdgesStatements(relationSide: RelationSide, sourceIDsNode: QueryNode): PreExecQueryParms {
    return new PreExecQueryParms({
        query: new RemoveEdgesQueryNode(relationSide.relation, getEdgeFilter({
            relationSide,
            sourceIDsNode
        }))
    });
}

/**
 * Creates an Edge identifier. Reorders source/target so that they match from/to in the relation
 */
function getEdgeIdentifier({relationSide, sourceIDNode, targetIDNode}: { relationSide: RelationSide; sourceIDNode: QueryNode; targetIDNode: QueryNode; }): EdgeIdentifier {
    if (relationSide.isFromSide) {
        return new EdgeIdentifier(sourceIDNode, targetIDNode);
    } else {
        return new EdgeIdentifier(targetIDNode, sourceIDNode);
    }
}

/**
 * Creates a partial edge identifier of the format ?->id or id->?
 */
function getPartialEdgeIdentifier({relationSide, sourceIDNode}: { relationSide: RelationSide; sourceIDNode: QueryNode }): PartialEdgeIdentifier {
    if (relationSide.isFromSide) {
        return new PartialEdgeIdentifier(sourceIDNode, undefined);
    } else {
        return new PartialEdgeIdentifier(undefined, sourceIDNode);
    }
}

/**
 * Creates an Edge filter. Reorders source/target so that they match from/to in the relation
 */
function getEdgeFilter({relationSide, sourceIDsNode, targetIDsNode}: { relationSide: RelationSide; sourceIDsNode?: QueryNode; targetIDsNode?: QueryNode }): EdgeFilter {
    if (relationSide.isFromSide) {
        return new EdgeFilter(sourceIDsNode, targetIDsNode);
    } else {
        return new EdgeFilter(targetIDsNode, sourceIDsNode);
    }
}
