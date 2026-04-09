import type { Field } from '../model/implementation/field.js';
import type { RootEntityType } from '../model/implementation/root-entity-type.js';
import { blue } from '../utils/colors.js';
import { indent } from '../utils/utils.js';
import { QueryNode } from './base.js';
import { ConstBoolQueryNode } from './literals.js';
import { VariableQueryNode } from './variables.js';

/**
 * A QueryNode that represents a vector nearest-neighbor search on a root entity type.
 *
 * This node follows the same innerNode+itemVariable pattern as TransformListQueryNode
 * and TraversalQueryNode, allowing the authorization framework and query-node-object-type
 * framework to traverse into innerNode for output mapping and field resolution.
 *
 * @param rootEntityType - the root entity type being searched
 * @param field - the field holding the vector embeddings (must have a vectorIndex)
 * @param vectorNode - a query node evaluating to the query vector ([Float])
 * @param nProbe - optional query-time recall knob; number of IVF clusters to probe
 * @param minScore - optional lower bound on the similarity score (COSINE / INNER_PRODUCT only)
 * @param maxDistance - optional upper bound on the distance score (L2 only)
 * @param filterNode - optional pre-filter applied before scoring; defaults to TRUE (no filter)
 * @param itemVariable - loop variable representing each candidate document
 * @param innerNode - the output projection node; defaults to itemVariable (identity)
 * @param skipNode - optional query node evaluating to the number of results to skip (LIMIT skip, count)
 * @param maxCountNode - optional query node evaluating to the maximum result count (LIMIT)
 */
export interface VectorSearchQueryNodeParams {
    readonly rootEntityType: RootEntityType;
    readonly field: Field;
    readonly vectorNode: QueryNode;
    readonly nProbe?: number;
    readonly minScore?: number;
    readonly maxDistance?: number;
    readonly filterNode?: QueryNode;
    readonly itemVariable?: VariableQueryNode;
    readonly innerNode?: QueryNode;
    readonly skipNode?: QueryNode;
    readonly maxCountNode: QueryNode;
}

export class VectorSearchQueryNode extends QueryNode {
    public readonly rootEntityType: RootEntityType;
    /** The field that holds the vector embeddings and carries the vectorIndex configuration. */
    public readonly field: Field;
    /** A query node that evaluates to the query vector ([Float]). */
    public readonly vectorNode: QueryNode;
    /** Number of IVF clusters to probe at query time; undefined uses the index default. */
    public readonly nProbe: number | undefined;
    /** Lower bound on similarity score; applicable to COSINE and INNER_PRODUCT metrics only. */
    public readonly minScore: number | undefined;
    /** Upper bound on distance; applicable to the L2 metric only. */
    public readonly maxDistance: number | undefined;
    public readonly filterNode: QueryNode;
    public readonly itemVariable: VariableQueryNode;
    public readonly innerNode: QueryNode;
    /** Optional offset: number of results to skip before returning (offset in LIMIT skip, count). */
    public readonly skipNode: QueryNode | undefined;
    public readonly maxCountNode: QueryNode;

    constructor(params: VectorSearchQueryNodeParams) {
        super();
        this.rootEntityType = params.rootEntityType;
        this.field = params.field;
        this.vectorNode = params.vectorNode;
        this.nProbe = params.nProbe;
        this.minScore = params.minScore;
        this.maxDistance = params.maxDistance;
        this.filterNode = params.filterNode ?? ConstBoolQueryNode.TRUE;
        this.itemVariable =
            params.itemVariable ?? new VariableQueryNode(params.rootEntityType.name.toLowerCase());
        this.innerNode = params.innerNode ?? this.itemVariable;
        this.skipNode = params.skipNode;
        this.maxCountNode = params.maxCountNode;
    }

    describe(): string {
        const metric = this.field.vectorIndex?.metric ?? 'unknown';
        const parts = [
            `Vector search ${blue(this.rootEntityType.name)} on field "${this.field.name}" (${metric})`,
            `with ${this.itemVariable.describe()} =>`,
        ];

        const details: string[] = [];
        if (!this.filterNode.equals(ConstBoolQueryNode.TRUE)) {
            details.push(`where ${this.filterNode.describe()}`);
        }
        if (this.nProbe != null) {
            details.push(`nProbe: ${this.nProbe}`);
        }
        if (this.minScore != null) {
            details.push(`minScore: ${this.minScore}`);
        }
        if (this.maxDistance != null) {
            details.push(`maxDistance: ${this.maxDistance}`);
        }
        if (this.skipNode) {
            details.push(`skip: ${this.skipNode.describe()}`);
        }
        if (this.maxCountNode) {
            details.push(`first: ${this.maxCountNode.describe()}`);
        }
        details.push(`as ${this.innerNode.describe()}`);

        return parts.join(' ') + '\n' + indent(details.join('\n'));
    }
}
