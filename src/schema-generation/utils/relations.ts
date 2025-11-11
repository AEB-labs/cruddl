import {
    Field,
    Multiplicity,
    RelationDeleteAction,
    RelationSide,
    RootEntityType,
} from '../../model';
import { RelationSegment } from '../../model/implementation/collect-path';
import {
    AddEdgesQueryNode,
    BinaryOperationQueryNode,
    BinaryOperator,
    DeleteEntitiesQueryNode,
    EdgeFilter,
    EdgeIdentifier,
    EntitiesIdentifierKind,
    EntityFromIdQueryNode,
    ErrorIfNotTruthyResultValidator,
    ListItemQueryNode,
    ListQueryNode,
    LiteralQueryNode,
    NoRestrictingObjectsOnDeleteValidator,
    NOT_FOUND_ERROR,
    PartialEdgeIdentifier,
    PreExecQueryParms,
    QueryNode,
    RemoveEdgesQueryNode,
    SetEdgeQueryNode,
    TraversalQueryNode,
    VariableQueryNode,
} from '../../query-tree';
import { PlainObject } from '../../utils/utils';
import { CreateRootEntityInputType } from '../create-input-types';
import { FieldContext } from '../query-node-object-type';
import { mapToIDNodesWithOptimizations } from './map';
import { FieldPath } from '../../model/implementation/field-path';

/**
 * Gets a statement that deletes existing outgoing edges and creates a new one, but does not check existing
 * incoming edges of the target
 */
function getNonCheckingSetEdgeStatement(
    sourceField: Field,
    sourceIDNode: QueryNode,
    targetIDNode: QueryNode,
): PreExecQueryParms {
    const relationSide = sourceField.getRelationSideOrThrow();
    const newEdge = getEdgeIdentifier({
        relationSide,
        sourceIDNode,
        targetIDNode,
    });
    // this one removes existing *outgoing* edges - see the multiplicity check for *incoming* edges of the target
    const existingEdge = getPartialEdgeIdentifier({
        relationSide,
        sourceIDNode,
    });
    return new PreExecQueryParms({
        query: new SetEdgeQueryNode({
            relation: relationSide.relation,
            newEdge,
            existingEdge,
        }),
    });
}

export function getSetEdgeStatements(
    sourceField: Field,
    sourceIDNode: QueryNode,
    targetID: string | null,
): ReadonlyArray<PreExecQueryParms> {
    const relationSide = sourceField.getRelationSideOrThrow();

    if (targetID == undefined) {
        // remove edge
        return [
            new PreExecQueryParms({
                query: new RemoveEdgesQueryNode(
                    relationSide.relation,
                    getEdgeFilter({
                        relationSide,
                        sourceIDsNode: new ListQueryNode([sourceIDNode]),
                    }),
                ),
            }),
        ];
    }

    const targetType = relationSide.otherSide.sourceType;

    const targetIDNode = new LiteralQueryNode(targetID);
    const setEdgeStatement = getNonCheckingSetEdgeStatement(
        sourceField,
        sourceIDNode,
        targetIDNode,
    );

    // check that target exists
    const targetExistsCheck = new PreExecQueryParms({
        query: new EntityFromIdQueryNode(targetType, targetIDNode),
        resultValidator: new ErrorIfNotTruthyResultValidator({
            errorCode: NOT_FOUND_ERROR,
            errorMessage: `${targetType.name} with id '${targetID}' does not exist`,
        }),
    });

    if (relationSide.targetMultiplicity == Multiplicity.ONE) {
        // target should link to at most one source, so we need to remove an edge to the target if exists

        const removeExistingEdgeStatement = new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(
                relationSide.relation,
                getEdgeFilter({
                    relationSide,
                    targetIDsNode: new ListQueryNode([targetIDNode]),
                }),
            ),
        });

        return [targetExistsCheck, removeExistingEdgeStatement, setEdgeStatement];
    } else {
        // target can link to many sources, and it can not exist yet (as we are in create mode), so we can just add it
        return [targetExistsCheck, setEdgeStatement];
    }
}

export function getAddEdgesStatements(
    sourceField: Field,
    sourceIDNode: QueryNode,
    targetIDs: ReadonlyArray<string>,
) {
    const relationSide = sourceField.getRelationSideOrThrow();

    // check that all targets exist
    const targetsExistChecks = targetIDs.map(
        (id) =>
            new PreExecQueryParms({
                query: new EntityFromIdQueryNode(relationSide.targetType, new LiteralQueryNode(id)),
                resultValidator: new ErrorIfNotTruthyResultValidator({
                    errorCode: NOT_FOUND_ERROR,
                    errorMessage: `${relationSide.targetType.name} with id '${id}' does not exist`,
                }),
            }),
    );

    const edges = targetIDs.map((id) =>
        getEdgeIdentifier({
            relationSide,
            sourceIDNode,
            targetIDNode: new LiteralQueryNode(id),
        }),
    );
    const addEdgesStatement = new PreExecQueryParms({
        query: new AddEdgesQueryNode(relationSide.relation, edges),
    });

    if (relationSide.targetMultiplicity === Multiplicity.ONE) {
        // target should link to at most one source, so we need to remove an edges to the targets if they exist

        const removeExistingEdgeStatement = new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(
                relationSide.relation,
                getEdgeFilter({
                    relationSide,
                    targetIDsNode: new LiteralQueryNode(targetIDs),
                }),
            ),
        });

        return [...targetsExistChecks, removeExistingEdgeStatement, addEdgesStatement];
    } else {
        return [...targetsExistChecks, addEdgesStatement];
    }
}

export function getCreateAndAddEdgesStatements(
    sourceField: Field,
    sourceIDNode: QueryNode,
    createRootEntityInputType: CreateRootEntityInputType,
    createInputs: ReadonlyArray<PlainObject>,
    context: FieldContext,
) {
    const relationSide = sourceField.getRelationSideOrThrow();

    const newEntityIdsVarNode = new VariableQueryNode('newEntityIds');
    const createStatements = createRootEntityInputType.getMultiCreateStatements(
        createInputs,
        newEntityIdsVarNode,
        context,
    );

    // we need an actual array here for AddEdgesQueryNode#edges, so we can't use a TransformListQueryNode
    const edges = createInputs.map((_, index) =>
        getEdgeIdentifier({
            relationSide,
            sourceIDNode,
            targetIDNode: new ListItemQueryNode(newEntityIdsVarNode, index),
        }),
    );
    const addEdgesStatement = new PreExecQueryParms({
        query: new AddEdgesQueryNode(relationSide.relation, edges),
    });

    return [...createStatements, addEdgesStatement];
}

export function getCreateAndSetEdgeStatements(
    sourceField: Field,
    sourceIDNode: QueryNode,
    createRootEntityInputType: CreateRootEntityInputType,
    createInput: PlainObject,
    context: FieldContext,
): ReadonlyArray<PreExecQueryParms> {
    const newEntityIdVarNode = new VariableQueryNode('newEntityId');
    const createStatements = createRootEntityInputType.getCreateStatements(
        createInput,
        newEntityIdVarNode,
        context,
    );
    const setEdgeStatement = getNonCheckingSetEdgeStatement(
        sourceField,
        sourceIDNode,
        newEntityIdVarNode,
    );
    return [...createStatements, setEdgeStatement];
}

export function getRemoveEdgesStatements(
    sourceField: Field,
    sourceIDNode: QueryNode,
    targetIDs: ReadonlyArray<string>,
): ReadonlyArray<PreExecQueryParms> {
    const relationSide = sourceField.getRelationSideOrThrow();
    return [
        new PreExecQueryParms({
            query: new RemoveEdgesQueryNode(
                relationSide.relation,
                getEdgeFilter({
                    relationSide,
                    sourceIDsNode: new ListQueryNode([sourceIDNode]),
                    targetIDsNode: new LiteralQueryNode(targetIDs),
                }),
            ),
        }),
    ];
}

export interface GetPreEntityRemovalStatementsOptions {
    /**
     * An array of paths to fields that should be treated as if they were configured with
     * onDelete=CASCADE
     */
    readonly additionalCascadeFields?: ReadonlyArray<FieldPath>;
}

interface PreEntityRemovalStatementsContext {
    readonly originalRootEntityType: RootEntityType;
    /**
     * All relation sides traversed, starting from the originalRootEntityType
     */
    readonly relationSideStack: ReadonlyArray<RelationSide>;

    /**
     * Relation sides that have been traversed, but not because of additionalCascadeFields
     *
     * additionalCascadeFields can contain relation sides multiple times. But if we're not following
     * these fixed sets of paths, and still found something we already encountered, that's an error
     */
    readonly relationSideStackForCycleCheck: ReadonlyArray<RelationSide>;

    /**
     * An array of paths to fields that should be treated as if they were configured with
     * onDelete=CASCADE
     *
     * each top-level array item is a path, and that path consists of multiple fields
     *
     * unpacked on each recursion level
     */
    readonly additionalCascadeFields: ReadonlyArray<ReadonlyArray<Field>>;
}

/**
 * Gets a list of statements covering the relation delete actions (including edge removal) of a list of root entities
 */
export function getPreEntityRemovalStatements(
    rootEntityType: RootEntityType,
    sourceIDsNode: QueryNode,
    { additionalCascadeFields = [] }: GetPreEntityRemovalStatementsOptions = {},
): ReadonlyArray<PreExecQueryParms> {
    return getPreEntityRemovalStatements0(rootEntityType, sourceIDsNode, {
        originalRootEntityType: rootEntityType,
        relationSideStack: [],
        relationSideStackForCycleCheck: [],
        additionalCascadeFields: additionalCascadeFields.map((f) => f.fields ?? []),
    });
}

function getPreEntityRemovalStatements0(
    rootEntityType: RootEntityType,
    sourceIDsNode: QueryNode,
    context: PreEntityRemovalStatementsContext,
): ReadonlyArray<PreExecQueryParms> {
    // uff
    // (how) do we handle recursion? something similar to collect? but with merging, collect-over-collect at the same time?
    // how about we don't

    // for any given action (RESTRICT OR CASCADE)
    // find all paths
    // generate collect-like nodes for the ids
    // generate delete query nodes (with getRemoveAllEntityEdgesStatements)
    // for REMOVE_EDGES, only generate getRemoveAllEdgesStatements

    // would work for direct recursion where we could just generate something like 0..1000 in the collect segment

    // deep?
    // REMOVE_EDGES -> stop (we only remove edges)
    // CASCADE -> continue (we might find all three types there)
    // RESTRICT -> stop (we fail anyway)

    function compare(a: RelationSide, b: RelationSide) {
        const aAction = getEffectiveDeleteAction(a, context);
        const bAction = getEffectiveDeleteAction(b, context);

        if (aAction === RelationDeleteAction.RESTRICT) {
            return -1;
        }
        if (bAction === RelationDeleteAction.RESTRICT) {
            return 1;
        }
        // second, cascade before DELETE_EDGES because it might contain indirect RESTRICTs
        if (aAction === RelationDeleteAction.CASCADE) {
            return -1;
        }
        if (bAction === RelationDeleteAction.CASCADE) {
            return 1;
        }
        return 0;
    }

    // process the RESTRICT stuff before the CASCADE stuff so we fail early and don't create a huge transaction that
    // needs to be rolled back
    return rootEntityType.relationSides
        .slice()
        .sort(compare)
        .flatMap((relationSide) =>
            getPreEntityRemovalStatementsForRelationSide(relationSide, sourceIDsNode, context),
        );
}

/**
 * Gets statements that collectively remove any incoming or outgoing edges of the given root entities
 */
function getPreEntityRemovalStatementsForRelationSide(
    relationSide: RelationSide,
    sourceIDsNode: QueryNode,
    context: PreEntityRemovalStatementsContext,
): ReadonlyArray<PreExecQueryParms> {
    const effectiveDeleteAction = getEffectiveDeleteAction(relationSide, context);

    if (effectiveDeleteAction === RelationDeleteAction.REMOVE_EDGES) {
        return [getRemoveAllEdgesStatement(relationSide, sourceIDsNode)];
    }

    // RESTRICT and CASCADE

    // don't recurse
    if (context.relationSideStackForCycleCheck.includes(relationSide)) {
        // should not occur because we validate this in the schema
        throw new Error(`onDelete=CASCADE on recursive entities`);
    }
    const newRelationSideStack = [...context.relationSideStack, relationSide];

    // first, find the entities
    const sourceField = relationSide.getSourceFieldOrThrow();
    const segment: RelationSegment = {
        kind: 'relation',
        field: sourceField,
        relationSide,
        isListSegment: sourceField.isList,
        isNullableSegment: !sourceField.isNonNull,
        resultIsNullable: !sourceField.isNonNull,
        resultIsList: sourceField.isList,
        minDepth: 1,
        maxDepth: 1,
        resultingType: relationSide.targetType,
        // following 1-to-n and then n-to-m means that one of the m entities may be reached via different entities of the n which all belong to the 1 entity
        // targetMultiplicity == MANY means that a target entity can be linked to many source entities
        resultMayContainDuplicateEntities: relationSide.targetMultiplicity === Multiplicity.MANY,
    };
    const collectNode = new TraversalQueryNode({
        sourceEntityNode: sourceIDsNode,
        entitiesIdentifierKind: EntitiesIdentifierKind.ID,
        sourceIsList: true,
        relationSegments: [segment],
        fieldSegments: [],
        alwaysProduceList: true,
    });

    switch (effectiveDeleteAction) {
        case RelationDeleteAction.RESTRICT:
            let idsNode = mapToIDNodesWithOptimizations(collectNode);
            // for recursive relations, make sure objects to-be-deleted don't block the deletion
            if (relationSide.sourceType === relationSide.targetType) {
                idsNode = new BinaryOperationQueryNode(
                    idsNode,
                    BinaryOperator.SUBTRACT_LISTS,
                    sourceIDsNode,
                );
            }

            return [
                new PreExecQueryParms({
                    query: idsNode,
                    resultValidator: new NoRestrictingObjectsOnDeleteValidator({
                        restrictedRootEntityType: context.originalRootEntityType,
                        restrictingRootEntityType: relationSide.targetType,
                        path: newRelationSideStack,
                    }),
                }),
                getRemoveAllEdgesStatement(relationSide, sourceIDsNode),
            ];

        case RelationDeleteAction.CASCADE:
            const targetIDsVariable = new VariableQueryNode(sourceField.name + 'IDs');

            // remove all paths unrelated to following this field, and strip this field from the others
            const newAdditionalCascadeFields = context.additionalCascadeFields
                .filter((f) => f[0] === relationSide.sourceField)
                .map((p) => p.slice(1));
            const newContext: PreEntityRemovalStatementsContext = {
                originalRootEntityType: context.originalRootEntityType,
                relationSideStack: newRelationSideStack,

                // start checking for cycles as soon as we're done with the additionalFields
                relationSideStackForCycleCheck: newAdditionalCascadeFields.length
                    ? []
                    : [...context.relationSideStackForCycleCheck, relationSide],

                additionalCascadeFields: newAdditionalCascadeFields,
            };

            return [
                // store the ids both for performance (don't repeat the collect) and to make sure the edges are not deleted too early
                new PreExecQueryParms({
                    query: mapToIDNodesWithOptimizations(collectNode),
                    resultVariable: targetIDsVariable,
                }),
                // this will generate remove-edges statements from the other side (which will be REMOVE_EDGES) so we don't need to
                // (seems pretty convoluted...)
                ...getPreEntityRemovalStatements0(
                    relationSide.targetType,
                    targetIDsVariable,
                    newContext,
                ),
                // do this last because getPreEntityRemovalStatements0 might result in RESTRICT statements
                new PreExecQueryParms({
                    query: new DeleteEntitiesQueryNode({
                        rootEntityType: relationSide.targetType,
                        listNode: targetIDsVariable,
                        entitiesIdentifierKind: EntitiesIdentifierKind.ID,
                    }),
                }),
            ];

        default:
            throw new Error(`Unexpected deleteAction: ${relationSide.deleteAction}`);
    }
}

function getEffectiveDeleteAction(
    relationSide: RelationSide,
    context: PreEntityRemovalStatementsContext,
): RelationDeleteAction {
    if (isCascadeField(relationSide, context)) {
        return RelationDeleteAction.CASCADE;
    }
    return relationSide.deleteAction;
}

function isCascadeField(relationSide: RelationSide, context: PreEntityRemovalStatementsContext) {
    if (relationSide.deleteAction === RelationDeleteAction.CASCADE) {
        return true;
    }
    if (!relationSide.sourceField) {
        // relation sides without sourceField can't be configured in additionalCascadeFields
        // (there is no field to reference them)
        return false;
    }

    return context.additionalCascadeFields.some((f) => f[0] === relationSide.sourceField);
}

/**
 * Get a statement that removes all edges in a relation related to the given root entities
 */
function getRemoveAllEdgesStatement(
    relationSide: RelationSide,
    sourceIDsNode: QueryNode,
): PreExecQueryParms {
    return new PreExecQueryParms({
        query: new RemoveEdgesQueryNode(
            relationSide.relation,
            getEdgeFilter({
                relationSide,
                sourceIDsNode,
            }),
        ),
    });
}

/**
 * Creates an Edge identifier. Reorders source/target so that they match from/to in the relation
 */
function getEdgeIdentifier({
    relationSide,
    sourceIDNode,
    targetIDNode,
}: {
    relationSide: RelationSide;
    sourceIDNode: QueryNode;
    targetIDNode: QueryNode;
}): EdgeIdentifier {
    if (relationSide.isFromSide) {
        return new EdgeIdentifier(sourceIDNode, targetIDNode);
    } else {
        return new EdgeIdentifier(targetIDNode, sourceIDNode);
    }
}

/**
 * Creates a partial edge identifier of the format ?->id or id->?
 */
function getPartialEdgeIdentifier({
    relationSide,
    sourceIDNode,
}: {
    relationSide: RelationSide;
    sourceIDNode: QueryNode;
}): PartialEdgeIdentifier {
    if (relationSide.isFromSide) {
        return new PartialEdgeIdentifier(sourceIDNode, undefined);
    } else {
        return new PartialEdgeIdentifier(undefined, sourceIDNode);
    }
}

/**
 * Creates an Edge filter. Reorders source/target so that they match from/to in the relation
 */
function getEdgeFilter({
    relationSide,
    sourceIDsNode,
    targetIDsNode,
}: {
    relationSide: RelationSide;
    sourceIDsNode?: QueryNode;
    targetIDsNode?: QueryNode;
}): EdgeFilter {
    if (relationSide.isFromSide) {
        return new EdgeFilter(sourceIDsNode, targetIDsNode);
    } else {
        return new EdgeFilter(targetIDsNode, sourceIDsNode);
    }
}
