import { Field, Relation, RootEntityType } from '../model';
import { indent } from '../utils/utils';
import { QueryNode } from './base';
import { PropertySpecification } from './objects';
import { VariableQueryNode } from './variables';

/**
 * A node that creates a new entity and evaluates to that new entity object
 */
export class CreateEntityQueryNode extends QueryNode {
    constructor(
        public readonly rootEntityType: RootEntityType,
        public readonly objectNode: QueryNode,
        public readonly affectedFields: ReadonlyArray<AffectedFieldInfoQueryNode>
    ) {
        super();
    }

    describe() {
        return `create ${
            this.rootEntityType.name
        } entity with values ${this.objectNode.describe()} (affects fields ${this.affectedFields
            .map(f => f.describe())
            .join(', ')})`;
    }
}

/**
 * A node that indicates that a field of a node is set, without being evaluated
 */
export class AffectedFieldInfoQueryNode extends QueryNode {
    constructor(public readonly field: Field) {
        super();
    }

    describe() {
        return `${this.field.declaringType.name}.${this.field.name}`;
    }
}

/**
 * A node that updates existing entities and evaluates to the ids of the updated entities
 *
 * Existing properties of the entities will be kept when not specified in the updateNode. If a property is specified
 * in updates and in the existing entity, it will be replaced with the PropertySpecification's value. To access the old
 * value of the entity within the updates, specify an oldValueVariable and use that inside the updates. Then, you can
 * access the old value of a field via a FieldQueryNode and use e.g. an UpdateObjectQueryNode to only modify some properties.
 *
 * FOR doc
 * IN $collection(objectType)
 * FILTER $filterNode
 * UPDATE doc
 * WITH $updateNode
 * IN $collection(objectType)
 * OPTIONS { mergeObjects: false }
 *
 * A revision can be specified, but the list should only evaluated in to at most one item in this case. If specified,
 * the transaction will be aborted if the revision is no longer up to date.
 */
export class UpdateEntitiesQueryNode extends QueryNode {
    constructor(params: {
        rootEntityType: RootEntityType;
        listNode: QueryNode;
        updates: ReadonlyArray<SetFieldQueryNode>;
        currentEntityVariable?: VariableQueryNode;
        affectedFields: ReadonlyArray<AffectedFieldInfoQueryNode>;
        revision?: string;
    }) {
        super();
        this.rootEntityType = params.rootEntityType;
        this.listNode = params.listNode;
        this.updates = params.updates;
        this.currentEntityVariable = params.currentEntityVariable || new VariableQueryNode();
        this.affectedFields = params.affectedFields;
        this.revision = params.revision;
    }

    public readonly rootEntityType: RootEntityType;
    public readonly listNode: QueryNode;
    public readonly updates: ReadonlyArray<SetFieldQueryNode>;
    public readonly currentEntityVariable: VariableQueryNode;
    public readonly affectedFields: ReadonlyArray<AffectedFieldInfoQueryNode>;
    public readonly revision?: string;

    describe() {
        return (
            `update ${this.rootEntityType.name} entities in (\n` +
            indent(this.listNode.describe()) +
            '\n) ' +
            (this.revision ? ` with revision check for "${JSON.stringify(this.revision)}"` : '') +
            `with values (${this.currentEntityVariable.describe()} => {\n` +
            indent(this.updates.map(p => p.describe()).join(',\n')) +
            `\n} (affects fields ${this.affectedFields.map(f => f.describe()).join(', ')})`
        );
    }
}

/**
 * Specifies one property of a an ObjectQueryNode, and indicates that this will set a field of an object
 */
export class SetFieldQueryNode extends PropertySpecification {
    constructor(public readonly field: Field, public readonly valueNode: QueryNode) {
        super(field.name, valueNode);
    }
}

/**
 * A node that deletes existing entities and evaluates to the entities before deletion
 *
 * Does not delete edges related to the entities.
 */
export class DeleteEntitiesQueryNode extends QueryNode {
    constructor(params: { rootEntityType: RootEntityType; listNode: QueryNode; revision?: string }) {
        super();
        this.rootEntityType = params.rootEntityType;
        this.listNode = params.listNode;
        this.revision = params.revision;
    }

    public readonly rootEntityType: RootEntityType;
    public readonly listNode: QueryNode;
    public readonly revision?: string;

    describe() {
        return (
            `delete ${this.rootEntityType.name} entities in (\n` +
            indent(this.listNode.describe()) +
            '\n)' +
            (this.revision ? ` with revision check for "${JSON.stringify(this.revision)}"` : '')
        );
    }
}

/**
 * A node that adds edges if they do not yet exist
 *
 * No multiplicity constraints are checked.
 */
export class AddEdgesQueryNode extends QueryNode {
    // TODO: accept one QueryNode which evaluates to the lits of edge ids somehow?
    // (currently, adding 50 edges generates 50 bound variables with the literal values)

    constructor(readonly relation: Relation, readonly edges: ReadonlyArray<EdgeIdentifier>) {
        super();
    }

    describe() {
        return (
            `add edges to ${this.relation}: [\n` + indent(this.edges.map(edge => edge.describe()).join(',\n')) + `\n]`
        );
    }
}

/**
 * A node that removes edges if they exist
 */
export class RemoveEdgesQueryNode extends QueryNode {
    constructor(readonly relation: Relation, readonly edgeFilter: EdgeFilter) {
        super();
    }

    describe() {
        return `remove edges from ${this.relation} matching ${this.edgeFilter.describe()}`;
    }
}

/**
 * Checks if an edge specified by existingEdge exists. If it does, replaces it by the newEdge. If it does not,
 * creates newEge.
 *
 * No multiplicity constraints are checked.
 */
export class SetEdgeQueryNode extends QueryNode {
    constructor(params: { relation: Relation; existingEdge: PartialEdgeIdentifier; newEdge: EdgeIdentifier }) {
        super();
        this.relation = params.relation;
        this.existingEdge = params.existingEdge;
        this.newEdge = params.newEdge;
    }

    readonly relation: Relation;
    readonly existingEdge: PartialEdgeIdentifier;
    readonly newEdge: EdgeIdentifier;

    describe() {
        return `replace edge ${this.existingEdge.describe()} by ${this.newEdge.describe()} in ${this.relation}`;
    }
}

/**
 * Filters edges by from and to id (from and to are and-combined, but the individual ids are or-combined)
 *
 * If e.g. fromIDsNode is undefined, this filter applies to all edges, regardless of the from id
 *
 * fromIDsNode and toIDsNode should evaluate to a *list* of ids.
 *
 * pseudo code: from IN fromIDsNode && to IN toIDsNode
 */
export class EdgeFilter extends QueryNode {
    constructor(readonly fromIDsNode?: QueryNode, readonly toIDsNode?: QueryNode) {
        super();
    }

    describe() {
        return `(${this.describeIDs(this.fromIDsNode)} -> ${this.describeIDs(this.toIDsNode)})`;
    }

    private describeIDs(ids: QueryNode | undefined) {
        if (!ids) {
            return '?';
        }
        return ids.describe();
    }
}

export class PartialEdgeIdentifier extends QueryNode {
    constructor(public readonly fromIDNode?: QueryNode, public readonly toIDNode?: QueryNode) {
        super();
    }

    describe() {
        return `(${this.describeNode(this.fromIDNode)} -> ${this.describeNode(this.toIDNode)})`;
    }

    private describeNode(node: QueryNode | undefined) {
        if (!node) {
            return '?';
        }
        return node.describe();
    }
}

export class EdgeIdentifier extends QueryNode {
    constructor(public readonly fromIDNode: QueryNode, public readonly toIDNode: QueryNode) {
        super();
    }

    describe() {
        return `(${this.fromIDNode.describe()} -> ${this.toIDNode.describe()})`;
    }
}
