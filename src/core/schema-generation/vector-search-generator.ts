import { GraphQLEnumType, GraphQLFloat, GraphQLInt, GraphQLList, GraphQLNonNull } from 'graphql';
import { memorize } from 'memorize-decorator';
import type { RootEntityType } from '../model/implementation/root-entity-type.js';
import type { VectorIndex } from '../model/implementation/vector-index.js';
import type { QueryNode } from '../query-tree/base.js';
import { ARGUMENT_OUT_OF_RANGE_ERROR, RuntimeErrorQueryNode } from '../query-tree/errors.js';
import { LiteralQueryNode } from '../query-tree/literals.js';
import { VariableQueryNode } from '../query-tree/variables.js';
import { VectorSearchQueryNode } from '../query-tree/vector-search.js';
import {
    FILTER_ARG,
    FIRST_ARG,
    SKIP_ARG,
    VECTOR_SEARCH_ENTITIES_FIELD_PREFIX,
} from '../schema/constants.js';
import { decapitalize } from '../utils/utils.js';
import type { FilterTypeGenerator } from './filter-input-types/generator.js';
import type { OutputTypeGenerator } from './output-type-generator.js';
import type { FieldContext } from './query-node-object-type/context.js';
import type { QueryNodeField } from './query-node-object-type/definition.js';
import { QueryNodeListType, QueryNodeNonNullType } from './query-node-object-type/definition.js';

const VECTOR_ARG = 'vector';
const N_PROBE_ARG = 'nProbe';
const MIN_SCORE_ARG = 'minScore';
const MAX_DISTANCE_ARG = 'maxDistance';
const FIELD_ARG = 'field';

export class VectorSearchGenerator {
    constructor(
        private readonly outputTypeGenerator: OutputTypeGenerator,
        private readonly filterTypeGenerator: FilterTypeGenerator,
    ) {}

    generate(rootEntityType: RootEntityType): QueryNodeField {
        const vectorIndices = rootEntityType.vectorIndices;
        if (vectorIndices.length === 0) {
            throw new Error(
                `Cannot generate vector search field for ${rootEntityType.name}: no vector indices`,
            );
        }

        const fieldName = VECTOR_SEARCH_ENTITIES_FIELD_PREFIX + rootEntityType.pluralName;
        const outputType = this.outputTypeGenerator.generate(rootEntityType);
        const filterType = this.filterTypeGenerator.generate(rootEntityType);
        const fieldEnumType = this.getVectorIndexFieldEnum(rootEntityType);

        // Only expose minScore/maxDistance for the metrics that actually use them.
        // minScore applies to similarity metrics; maxDistance applies to the L2 distance metric.
        const hasSimMetric = vectorIndices.some(
            (vi) => vi.metric === 'COSINE' || vi.metric === 'INNER_PRODUCT',
        );
        const hasL2Metric = vectorIndices.some((vi) => vi.metric === 'L2');

        return {
            name: fieldName,
            type: new QueryNodeListType(new QueryNodeNonNullType(outputType)),
            description: `Searches for ${rootEntityType.pluralName} using vector nearest-neighbor search.`,
            isPure: true,
            args: {
                [FIELD_ARG]: { type: new GraphQLNonNull(fieldEnumType) },
                [VECTOR_ARG]: {
                    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLFloat))),
                },
                [FIRST_ARG]: { type: new GraphQLNonNull(GraphQLInt) },
                [SKIP_ARG]: { type: GraphQLInt },
                [N_PROBE_ARG]: { type: GraphQLInt },
                ...(hasSimMetric ? { [MIN_SCORE_ARG]: { type: GraphQLFloat } } : {}),
                ...(hasL2Metric ? { [MAX_DISTANCE_ARG]: { type: GraphQLFloat } } : {}),
                [FILTER_ARG]: { type: filterType.getInputType() },
            },
            resolve: (sourceNode, args, info) =>
                this.buildVectorSearchNode(rootEntityType, vectorIndices, args, info),
        };
    }

    private buildVectorSearchNode(
        rootEntityType: RootEntityType,
        vectorIndices: ReadonlyArray<VectorIndex>,
        args: { [key: string]: any },
        info: FieldContext,
    ): QueryNode {
        const selectedFieldName = args[FIELD_ARG] as string;
        const vectorIndex = vectorIndices.find((vi) => vi.field.name === selectedFieldName);
        if (!vectorIndex) {
            // Reaching this branch means the enum value was accepted by GraphQL but no matching
            // vector index exists — this indicates a bug in getVectorIndexFieldEnum.
            throw new Error(
                `No vector index found for field "${selectedFieldName}" on type "${rootEntityType.name}" — this is a bug`,
            );
        }

        const vector = args[VECTOR_ARG] as number[];
        const first = args[FIRST_ARG] as number;
        const skip = args[SKIP_ARG] as number | undefined;
        const nProbe = args[N_PROBE_ARG] as number | undefined;
        const minScore = args[MIN_SCORE_ARG] as number | undefined;
        const maxDistance = args[MAX_DISTANCE_ARG] as number | undefined;
        const filterValue = args[FILTER_ARG];

        // Runtime validations
        if (first < 1) {
            return new RuntimeErrorQueryNode(`"first" must be a positive integer, got ${first}`, {
                code: ARGUMENT_OUT_OF_RANGE_ERROR,
            });
        }

        if (info.maxLimitForRootEntityQueries && first > info.maxLimitForRootEntityQueries) {
            return new RuntimeErrorQueryNode(
                `The requested number of elements via the "first" parameter (${first}) exceeds the maximum limit of ${info.maxLimitForRootEntityQueries}.`,
                { code: ARGUMENT_OUT_OF_RANGE_ERROR },
            );
        }

        if (skip != null && skip < 0) {
            return new RuntimeErrorQueryNode(
                `"skip" must be a non-negative integer if specified, got ${skip}`,
                { code: ARGUMENT_OUT_OF_RANGE_ERROR },
            );
        }

        if (nProbe != null && nProbe < 1) {
            return new RuntimeErrorQueryNode(
                `"nProbe" must be a positive integer if specified, got ${nProbe}`,
                { code: ARGUMENT_OUT_OF_RANGE_ERROR },
            );
        }

        if (nProbe != null && vectorIndex.maxNProbe != null && nProbe > vectorIndex.maxNProbe) {
            return new RuntimeErrorQueryNode(
                `"nProbe" (${nProbe}) exceeds the maximum allowed value of ${vectorIndex.maxNProbe} for field "${selectedFieldName}"`,
                { code: ARGUMENT_OUT_OF_RANGE_ERROR },
            );
        }

        // Use the index's defaultNProbe when the caller does not specify nProbe explicitly.
        // defaultNProbe is NOT stored in the ArangoDB index — it is always passed at query time
        // so that changes to the schema value take effect immediately without index recreation.
        const effectiveNProbe = nProbe ?? vectorIndex.defaultNProbe;

        const dimension = vectorIndex.dimension!;
        if (vector.length !== dimension) {
            return new RuntimeErrorQueryNode(
                `vector must have exactly ${dimension} elements for field "${selectedFieldName}", got ${vector.length}`,
            );
        }

        const metric = vectorIndex.metric;

        if (minScore != null && metric === 'L2') {
            return new RuntimeErrorQueryNode(
                `Field "${selectedFieldName}" uses the L2 distance metric — use "maxDistance" instead of "minScore"`,
            );
        }

        if (maxDistance != null && metric !== 'L2') {
            return new RuntimeErrorQueryNode(
                `Field "${selectedFieldName}" uses the ${metric} similarity metric — use "minScore" instead of "maxDistance"`,
            );
        }

        // Build the filter node once with the correct itemVariable
        const itemVariable = new VariableQueryNode(decapitalize(rootEntityType.name));
        let filterNode: QueryNode | undefined;
        if (filterValue && Object.keys(filterValue).length > 0) {
            const filterType = this.filterTypeGenerator.generate(rootEntityType);
            filterNode = filterType.getFilterNode(itemVariable, filterValue);
        }

        return new VectorSearchQueryNode({
            rootEntityType,
            field: vectorIndex.field,
            vectorNode: new LiteralQueryNode(vector),
            nProbe: effectiveNProbe,
            minScore,
            maxDistance,
            filterNode,
            itemVariable,
            skipNode: skip != null ? new LiteralQueryNode(skip) : undefined,
            maxCountNode: new LiteralQueryNode(first),
        });
    }

    @memorize()
    private getVectorIndexFieldEnum(rootEntityType: RootEntityType): GraphQLEnumType {
        const values: { [key: string]: { value: string } } = {};
        for (const vi of rootEntityType.vectorIndices) {
            values[vi.field.name] = { value: vi.field.name };
        }
        return new GraphQLEnumType({
            name: `${rootEntityType.name}VectorIndexField`,
            values,
        });
    }
}
