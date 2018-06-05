import { GraphQLID, GraphQLInputType, GraphQLList, GraphQLNonNull } from 'graphql';
import { Field, Multiplicty, Relation, RelationFieldSide } from '../../model';
import {
    AddEdgesQueryNode, EdgeFilter, EdgeIdentifier, EntityFromIdQueryNode, ErrorIfNotTruthyResultValidator,
    LiteralQueryNode, PartialEdgeIdentifier, PreExecQueryParms, QueryNode, RemoveEdgesQueryNode, SetEdgeQueryNode,
    SetFieldQueryNode
} from '../../query-tree';
import { AnyValue } from '../../utils/utils';
import { UpdateInputField } from './input-fields';

export abstract class AbstractRelationUpdateInputField implements UpdateInputField {
    constructor(
        public readonly field: Field
    ) {

    }

    abstract readonly inputType: GraphQLInputType;

    get name() {
        return this.field.name;
    }

    appliesToMissingFields(): boolean {
        return false;
    }

    collectAffectedFields(value: AnyValue, fields: Set<Field>): void {
        fields.add(this.field);
    }

    getProperties(value: AnyValue): ReadonlyArray<SetFieldQueryNode> {
        return [];
    }

    abstract getStatements(value: AnyValue, idNode: QueryNode): ReadonlyArray<PreExecQueryParms>
}

export class SetEdgeInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = GraphQLID;

    getStatements(targetID: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        const relation = this.field.getRelationOrThrow();

        if (targetID == undefined) {
            // remove edge
            return [
                new PreExecQueryParms({
                    query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                        relation,
                        sourceField: this.field,
                        sourceIDNodes: [sourceIDNode]
                    }))
                })
            ];
        }

        const otherType = relation.getOtherType(this.field);

        const targetIDNode = new LiteralQueryNode(targetID);
        const newEdge = getEdgeIdentifier({
            relation,
            sourceIDNode,
            targetIDNode,
            sourceField: this.field
        });
        // this one removes existing *outgoing* edges - see the multiplicity check for *incoming* edges of the target
        const existingEdge = getPartialEdgeIdentifier({
            relation,
            sourceIDNode,
            sourceField: this.field
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

        const targetMultiplicity = relation.getTargetMultiplicity(this.field);
        if (targetMultiplicity == Multiplicty.ONE) {
            // target should link to at most one source, so we need to remove an edge to the target if exists

            const removeExistingEdgeStatement = new PreExecQueryParms({
                query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                    relation,
                    sourceField: this.field,
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
}

export class AddEdgesInputField extends AbstractRelationUpdateInputField {
    readonly inputType: GraphQLInputType = new GraphQLList(new GraphQLNonNull(GraphQLID));

    getStatements(value: AnyValue, sourceIDNode: QueryNode): ReadonlyArray<PreExecQueryParms> {
        if (value == undefined) {
            return [];
        }
        if (!Array.isArray(value)) {
            throw new Error(`Expected value of "${this.name}" to be an array, but is ${typeof value}`);
        }
        const ids = value as ReadonlyArray<string>;

        const relation = this.field.getRelationOrThrow();
        const targetType = relation.getOtherType(this.field);

        // check that all targets exist
        const targetsExistChecks = ids.map(id => new PreExecQueryParms({
            query: new EntityFromIdQueryNode(targetType, new LiteralQueryNode(id)),
            resultValidator: new ErrorIfNotTruthyResultValidator(`${targetType.name} with id '${id}' does not exist`)
        }));

        const edges = ids.map(id => getEdgeIdentifier({
            relation,
            sourceIDNode,
            targetIDNode: new LiteralQueryNode(id),
            sourceField: this.field
        }));
        const addEdgesStatement = new PreExecQueryParms({
            query: new AddEdgesQueryNode(relation, edges)
        });

        const targetMultiplicity = relation.getTargetMultiplicity(this.field);
        if (targetMultiplicity == Multiplicty.ONE) {
            // target should link to at most one source, so we need to remove an edges to the targets if they exist

            const removeExistingEdgeStatement = new PreExecQueryParms({
                query: new RemoveEdgesQueryNode(relation, getEdgeFilter({
                    relation,
                    sourceField: this.field,
                    targetIDNodes: ids.map(id => new LiteralQueryNode(id))
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
}

export function isRelationUpdateField(field: UpdateInputField): field is AbstractRelationUpdateInputField {
    return field instanceof AbstractRelationUpdateInputField;
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
