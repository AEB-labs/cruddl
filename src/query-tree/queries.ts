import { Field, RelationSide, RootEntityType } from '../model';
import {
    CollectPathSegment,
    FieldSegment,
    RelationSegment,
} from '../model/implementation/collect-path';
import { blue } from '../utils/colors';
import { QueryNode } from './base';
import { EntitiesIdentifierKind } from './mutations';
import { VariableQueryNode } from './variables';
import { indent } from '../utils/utils';
import { OrderSpecification } from './lists';

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

export interface TraversalQueryNodeParams {
    readonly entitiesIdentifierKind?: EntitiesIdentifierKind;
    readonly sourceEntityNode: QueryNode;
    readonly relationSegments: ReadonlyArray<RelationSegment>;
    readonly fieldSegments: ReadonlyArray<FieldSegment>;

    /**
     * Specifies if sourceEntityNode resolves to a list of entities instead of a single entity
     */
    readonly sourceIsList?: boolean;

    /**
     * Specifies if the result should be a list of one value if the path results in a single object instead of a list
     *
     * Only supported if fieldSegments is empty
     */
    readonly alwaysProduceList?: boolean;

    /**
     * If true and this traversal results in a list, NULL values will be preserved in the list
     *
     * Note: this only exists for aggregations, so it might not work in every case
     *
     * @default false
     */
    readonly preserveNullValues?: boolean;

    /**
     * An optional transformation (map) to apply on the traversal result
     */
    readonly innerNode?: QueryNode;

    /**
     * The variable under which each item will be available in the innerNode
     */
    readonly itemVariable?: VariableQueryNode;

    /**
     * The variable under which the root entity (result after relation traversal, but before child entity traversals)
     * will be available in the innerNode
     */
    readonly rootEntityVariable?: VariableQueryNode;

    /**
     * An optional filter that is applied on the resulting items of the traversal
     *
     * Don't access rootEntityVariable here (if we need that, we should add a rootFilterNode that is
     * applied after the relation traversal but before the field traversal)
     */
    readonly filterNode?: QueryNode;

    /**
     * An optional filter that is applied on the resulting items of the traversal
     *
     * Both item and root can be accessed here
     */
    readonly orderBy?: OrderSpecification;

    /**
     * Number of items to skip at the start
     */
    readonly skip?: number;

    /**
     * Maximum number of items to return
     */
    readonly maxCount?: number;
}

/**
 * Traverses a path of relations and other fields
 */
export class TraversalQueryNode extends QueryNode {
    readonly entitiesIdentifierKind: EntitiesIdentifierKind;
    readonly sourceEntityNode: QueryNode;
    readonly relationSegments: ReadonlyArray<RelationSegment>;
    readonly fieldSegments: ReadonlyArray<FieldSegment>;

    /**
     * Specifies if sourceEntityNode resolves to a list of entities instead of a single entity
     */
    readonly sourceIsList: boolean;

    /**
     * Specifies if the result should be a list of one value if the path results in a single object instead of a list
     *
     * Only supported if fieldSegments is empty
     */
    readonly alwaysProduceList: boolean;

    /**
     * True if either alwaysProduceList is true or there is at least one list segment
     */
    readonly resultIsList: boolean;

    /**
     * If true and this traversal results in a list, NULL values will be preserved in the list
     *
     * Note: this only exists for aggregations, so it might not work in every case
     */
    readonly preserveNullValues: boolean;

    /**
     * An optional transformation (map) to apply on the traversal result
     */
    readonly innerNode?: QueryNode;

    /**
     * An optional filter that is applied on the resulting items of the traversal
     *
     * Don't access rootEntityVariable here (if we need that, we should add a rootFilterNode that is
     * applied after the relation traversal but before the field traversal)
     */
    readonly filterNode?: QueryNode;

    /**
     * An optional filter that is applied on the resulting items of the traversal
     *
     * Both item and root can be accessed here
     */
    readonly orderBy: OrderSpecification;

    /**
     * The variable under which each item will be available in the innerNode
     */
    readonly itemVariable: VariableQueryNode;

    /**
     * The variable under which the root entity (result after relation traversal, but before child entity traversals)
     * will be available in the innerNode
     */
    readonly rootEntityVariable: VariableQueryNode;

    /**
     * Number of items to skip at the start
     */
    readonly skip: number;

    /**
     * Maximum number of items to return
     */
    readonly maxCount?: number;

    constructor(params: TraversalQueryNodeParams) {
        super();

        // don't need those with field segments, so don't support it
        if (params.sourceIsList && params.fieldSegments.length > 0) {
            throw new Error(
                `TraversalQueryNode with sourceIsList=true can only be used when there are no fieldSegments`,
            );
        }
        if (params.alwaysProduceList && params.fieldSegments.length > 0) {
            throw new Error(
                `TraversalQueryNode with alwaysProduceList=true can only be used when there are no fieldSegments`,
            );
        }

        this.sourceEntityNode = params.sourceEntityNode;
        this.relationSegments = params.relationSegments;
        this.fieldSegments = params.fieldSegments;
        this.sourceIsList = params.sourceIsList ?? false;
        this.alwaysProduceList = params.alwaysProduceList ?? false;
        this.preserveNullValues = params.preserveNullValues ?? false;
        this.entitiesIdentifierKind =
            params.entitiesIdentifierKind || EntitiesIdentifierKind.ENTITY;
        this.innerNode = params.innerNode;
        this.filterNode = params.filterNode;
        this.orderBy = params.orderBy ?? OrderSpecification.UNORDERED;
        this.itemVariable = params.itemVariable ?? new VariableQueryNode(`item`);
        this.rootEntityVariable = params.rootEntityVariable ?? new VariableQueryNode(`root`);
        this.skip = params.skip ?? 0;
        this.maxCount = params.maxCount;

        this.resultIsList =
            this.alwaysProduceList ||
            this.fieldSegments.some((s) => s.resultIsList) ||
            this.relationSegments.some((s) => s.resultIsList);
    }

    describe() {
        const segments = [...this.relationSegments, ...this.fieldSegments];
        return (
            `traverse "${segments.map((s) => this.describeSegment(s)).join('.')}" (\n` +
            indent(
                `from ${this.sourceEntityNode.describe()}${this.sourceIsList ? ' (as list)' : ''}${this.alwaysProduceList ? ` as list` : ''}` +
                    `\nitem var: ${this.itemVariable?.describe()}, root var: ${this.rootEntityVariable?.describe()}` +
                    (this.filterNode ? `\nwith filter: ${this.filterNode.describe()}` : '') +
                    (!this.orderBy.isUnordered() ? `\norder by: ${this.orderBy.describe()}` : '') +
                    (this.skip != 0 ? `skip ${this.skip}\n` : '') +
                    (this.maxCount != undefined ? `limit ${this.maxCount}\n` : '') +
                    (this.preserveNullValues ? `preserving null values\n` : '') +
                    (this.innerNode ? `\nas ${this.innerNode.describe()}` : ''),
            ) +
            `\n)`
        );
    }

    private describeSegment(segment: CollectPathSegment) {
        if (segment.kind === 'relation') {
            return `${segment.field.name}{${segment.minDepth},${segment.maxDepth}}`;
        }
        return segment.field.name;
    }
}
