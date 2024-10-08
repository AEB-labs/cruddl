import { Field, RelationSide, RootEntityType } from '../model';
import {
    CollectPathSegment,
    FieldSegment,
    RelationSegment,
} from '../model/implementation/collect-path';
import { blue } from '../utils/colors';
import { QueryNode } from './base';
import { EntitiesIdentifierKind } from './mutations';

export class EntityFromIdQueryNode extends QueryNode {
    constructor(
        public readonly rootEntityType: RootEntityType,
        public readonly idNode: QueryNode,
    ) {
        super();
    }

    public describe() {
        return `${blue(this.rootEntityType.name)} with id (${this.idNode.describe()})`;
    }
}

/**
 * A node that evaluates in the list of entities of a given type. use ListQueryNode to further process them
 */
export class EntitiesQueryNode extends QueryNode {
    constructor(public readonly rootEntityType: RootEntityType) {
        super();
    }

    describe() {
        return `entities of type ${blue(this.rootEntityType.name)}`;
    }
}

/**
 * A node that evaluates to the value of a field of an object, or NULL if it does not exist or objectNode does not
 * evaluate to an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldQueryNode extends QueryNode {
    constructor(
        public readonly objectNode: QueryNode,
        public readonly field: Field,
    ) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}.${blue(this.field.name)}`;
    }
}

/**
 * A node that evaluates to the value of a field of an object, or NULL if it does not exist or objectNode does not
 * evaluate to an object
 *
 * Note: this is unrelated to storing the value in a property of a result object, see ObjectQueryNode
 */
export class FieldPathQueryNode extends QueryNode {
    constructor(
        public readonly objectNode: QueryNode,
        public readonly path: ReadonlyArray<Field>,
    ) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}.${blue(
            this.path.map((value) => value.name).join('.'),
        )}`;
    }
}

/**
 * A node that evaluates to the value of a property of an object, or NULL if it does not exist or objectNode does not
 * evaluate to an object
 *
 * This is equivalent to a FieldQueryNode except there does not need to be a model field. Authorization checks will not
 * be applied.
 */
export class PropertyAccessQueryNode extends QueryNode {
    constructor(
        public readonly objectNode: QueryNode,
        public readonly propertyName: string,
    ) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}.${blue(this.propertyName)}`;
    }
}

/**
 * A node that evaluates to the value of a property of an object, or NULL if it does not exist or objectNode does not
 * evaluate to an object
 */
export class DynamicPropertyAccessQueryNode extends QueryNode {
    constructor(
        public readonly objectNode: QueryNode,
        public readonly propertyNode: QueryNode,
    ) {
        super();
    }

    public describe() {
        return `${this.objectNode.describe()}[${this.propertyNode.describe()}]`;
    }
}

/**
 * A node that evaluates to the id of a root entity
 */
export class RootEntityIDQueryNode extends QueryNode {
    constructor(public readonly objectNode: QueryNode) {
        super();
    }

    public describe() {
        return `id(${this.objectNode.describe()})`;
    }
}

/**
 * A node that evaluates to the revision identifier of a root entity
 */
export class RevisionQueryNode extends QueryNode {
    constructor(readonly objectNode: QueryNode) {
        super();
    }

    describe(): string {
        return `revision(${this.objectNode.describe()})`;
    }
}

/**
 * Evaluates to all root entities that are connected to a specific root entitity through a specific edge
 */
export class FollowEdgeQueryNode extends QueryNode {
    constructor(
        readonly relationSide: RelationSide,
        readonly sourceEntityNode: QueryNode,
    ) {
        super();
    }

    describe() {
        const dir = this.relationSide.isFromSide ? 'forward' : 'backward';
        return `follow ${dir} ${blue(
            this.relationSide.relation.toString(),
        )} of ${this.sourceEntityNode.describe()}`;
    }
}

interface TraversalQueryNodeParams {
    readonly entitiesIdentifierKind?: EntitiesIdentifierKind;
    readonly sourceEntityNode: QueryNode;
    readonly sourceIsList?: boolean;
    readonly alwaysProduceList?: boolean;
    readonly relationSegments: ReadonlyArray<RelationSegment>;
    readonly fieldSegments: ReadonlyArray<FieldSegment>;
    readonly captureRootEntities: boolean;
}

/**
 * Traverses a path of relations and other fields
 */
export class TraversalQueryNode extends QueryNode {
    readonly entitiesIdentifierKind: EntitiesIdentifierKind;
    readonly sourceEntityNode: QueryNode;
    readonly relationSegments: ReadonlyArray<RelationSegment>;
    readonly fieldSegments: ReadonlyArray<FieldSegment>;
    readonly captureRootEntity: boolean;

    /**
     * Specifies if sourceEntityNode resolves to a list of entities instead of a single entity
     */
    readonly sourceIsList: boolean;

    /**
     * Specifies if the result should be a list one value if the path results in a single object instead of a list
     */
    readonly alwaysProduceList: boolean;

    constructor(params: TraversalQueryNodeParams) {
        super();

        if (params.captureRootEntities && (!params.relationSegments || !params.fieldSegments)) {
            throw new Error(
                `A TraversalQueryNode with captureRootEntity=true requires both relationSegments and fieldSegments`,
            );
        }

        if (params.sourceIsList && !params.relationSegments) {
            // only need this, so keep it simpler
            throw new Error(
                `A TraversalQueryNode with sourceIsList=true requires relationSegments`,
            );
        }

        this.sourceEntityNode = params.sourceEntityNode;
        this.relationSegments = params.relationSegments;
        this.fieldSegments = params.fieldSegments;
        this.captureRootEntity = params.captureRootEntities;
        this.sourceIsList = params.sourceIsList ?? false;
        this.alwaysProduceList = params.alwaysProduceList ?? false;
        this.entitiesIdentifierKind =
            params.entitiesIdentifierKind || EntitiesIdentifierKind.ENTITY;
    }

    describe() {
        const segments = [...this.relationSegments, ...this.fieldSegments];
        return (
            `traverse ${segments.map((s) => this.describeSegment(s)).join('.')}` +
            `from ${this.sourceEntityNode.describe()}${this.sourceIsList ? ' (as list)' : ''}${
                this.captureRootEntity ? ` into { obj, root }` : ''
            }${this.alwaysProduceList ? ` as list` : ''}`
        );
    }

    private describeSegment(segment: CollectPathSegment) {
        if (segment.kind === 'relation') {
            return `${segment.field.name}{${segment.minDepth},${segment.maxDepth}}`;
        }
        return segment.field.name;
    }
}
