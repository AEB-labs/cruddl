import { AggregationOperator, RootEntityType } from '../model';
import { Field } from '../model/implementation';
import { getEffectiveCollectSegments } from '../model/implementation/collect-path';
import {
    AggregationQueryNode,
    BasicType,
    BinaryOperationQueryNode,
    BinaryOperator,
    ConditionalQueryNode,
    CountQueryNode,
    EntitiesQueryNode,
    FieldQueryNode,
    FirstOfListQueryNode,
    FollowEdgeQueryNode,
    NullQueryNode,
    ObjectQueryNode,
    QueryNode,
    RootEntityIDQueryNode,
    SafeListQueryNode,
    TransformListQueryNode,
    TraversalQueryNode,
    TypeCheckQueryNode,
    VariableQueryNode,
} from '../query-tree';
import { ID_FIELD } from '../schema/constants';
import { GraphQLOffsetDateTime } from '../schema/scalars/offset-date-time';
import { getScalarFilterValueNode } from './filter-input-types/filter-fields';
import { and } from './utils/input-types';
import { decapitalize } from '../utils/utils';

export interface CreateFieldNodeOptions {
    readonly skipNullFallbackForEntityExtensions?: boolean;
    readonly rootEntityVar?: VariableQueryNode;

    /**
     * If true, child entity fields use a TraversalQueryNode instead of a FieldQueryNode
     *
     * This is useful if it is expected that filtering, mapping, sorting etc. will be added because
     * TraversalQueryNode has native support for those and will be optimized better in the AQL generation.
     *
     * We do not always set this, because sometimes, a FieldQueryNode (with SafeListQueryNode)
     * can be recognized more easily by other optimizations like those of QuantifierFilterNode
     *
     * @default false
     */
    readonly preferTraversals?: boolean;

    /**
     * Call this on collect fields that traverse root entities to store a reference to the root entity in the stack
     */
    readonly registerRootNode?: (rootNode: QueryNode) => void;
}

// collect fields without aggregation or with a different operator can and should discard NULL values
const aggregationsThatNeedNullValues: ReadonlySet<AggregationOperator> = new Set([
    AggregationOperator.COUNT,
    AggregationOperator.SOME,
    AggregationOperator.NONE,
    AggregationOperator.COUNT_NULL,
    AggregationOperator.SOME_NULL,
    AggregationOperator.NONE_NULL,
]);

export function createFieldNode(
    field: Field,
    sourceNode: QueryNode,
    options: CreateFieldNodeOptions = {},
): QueryNode {
    // make use of the fact that field access on non-objects is NULL, so that type checks for OBJECT are redundant
    // this e.g. reverses the effect of the isEntityExtensionType check below
    // this is important for filter/orderBy which do not work if there is a conditional
    if (
        sourceNode instanceof ConditionalQueryNode &&
        sourceNode.condition instanceof TypeCheckQueryNode &&
        sourceNode.condition.type === BasicType.OBJECT &&
        sourceNode.expr1 === sourceNode.condition.valueNode
    ) {
        sourceNode = sourceNode.expr1;
    }

    // we would need context for this
    if (field.isRootField || field.isParentField) {
        throw new Error(
            `Tried to createFieldNoe on root/parent field "${field.declaringType.name}.${field.name}`,
        );
    }

    if (field.collectPath) {
        const { relationSegments, fieldSegments } = getEffectiveCollectSegments(field.collectPath);
        const rootEntityVariable = options.registerRootNode
            ? new VariableQueryNode('collectRoot')
            : undefined;
        const preserveNullValues =
            !!field.aggregationOperator &&
            aggregationsThatNeedNullValues.has(field.aggregationOperator);
        const traversalNode = new TraversalQueryNode({
            sourceEntityNode: sourceNode,
            relationSegments,
            fieldSegments,
            rootEntityVariable,
            preserveNullValues,
        });
        if (options.registerRootNode && rootEntityVariable) {
            options.registerRootNode(rootEntityVariable);
        }

        if (!field.aggregationOperator) {
            return traversalNode;
        } else {
            let items: QueryNode = traversalNode;
            // note: we used to use CountQueryNode for AggregationOperator.COUNT here, but that
            // meant that the COUNT aggregation operator was never tested. Consistently having an
            // AggregationQueryNode with TraversalQueryNodes also will help us generate more
            // straightforward AQL in the future (we might even make it a property of
            // TraversalQueryNode)

            if (
                field.collectPath.resultingType &&
                field.collectPath.resultingType.isScalarType &&
                field.collectPath.resultingType.graphQLScalarType === GraphQLOffsetDateTime
            ) {
                // TODO aql-perf move this into the TraversalQueryNode's innerNode
                const offsetDateTimeNode = new VariableQueryNode('offsetDateTime');
                items = new TransformListQueryNode({
                    listNode: items,
                    itemVariable: offsetDateTimeNode,
                    innerNode: getScalarFilterValueNode(
                        offsetDateTimeNode,
                        field.collectPath.resultingType,
                    ),
                });
            }

            // TODO aql-perf think about moving the DISTINCT operator into TraversalQueryNode
            // code like the ListAugmentation recognizes TraversalQueryNode and puts its additions
            // into that existing node. They do not know about AggregationQueryNode, so they wrap
            // it in a TransformListQueryNode. This is good for correctness (ensures that DISTICNT
            // happens before the mapping step), but bad for performance.

            // scalar fields should be ordered automatically because there is no argument to sort them
            const sort =
                field.aggregationOperator === AggregationOperator.DISTINCT &&
                (field.type.isScalarType || field.type.isEnumType);
            return new AggregationQueryNode(items, field.aggregationOperator, { sort });
        }
    }

    if (field.isList) {
        if (field.isRelation) {
            return createToNRelationNode(field, sourceNode);
        }

        // note: there are no lists of references

        if (options.preferTraversals) {
            return new TraversalQueryNode({
                sourceEntityNode: sourceNode,
                itemVariable: new VariableQueryNode(decapitalize(field.type.name)),
                fieldSegments: [
                    {
                        field,
                        isListSegment: true,
                        resultingType: field.type,
                        isNullableSegment: false,
                        resultIsList: true,
                        kind: 'field',
                        resultIsNullable: false,
                        resultMayContainDuplicateEntities: false,
                    },
                ],
                relationSegments: [],
            });
        }

        return createSafeListQueryNode(new FieldQueryNode(sourceNode, field));
    }

    if (field.isRelation) {
        return createTo1RelationNode(field, sourceNode);
    }

    if (field.isReference) {
        return createTo1ReferenceNode(field, sourceNode);
    }

    if (field.declaringType.isRootEntityType && field.isSystemField && field.name == ID_FIELD) {
        return new RootEntityIDQueryNode(sourceNode);
    }

    const fieldNode = new FieldQueryNode(sourceNode, field);
    if (field.type.isEntityExtensionType && !options.skipNullFallbackForEntityExtensions) {
        return new ConditionalQueryNode(
            new TypeCheckQueryNode(fieldNode, BasicType.OBJECT),
            fieldNode,
            ObjectQueryNode.EMPTY,
        );
    }

    return fieldNode;
}

function createTo1ReferenceNode(field: Field, sourceNode: QueryNode): QueryNode {
    const referencedEntityType = field.type as RootEntityType;
    const keyFieldInReferencedEntity = referencedEntityType.getKeyFieldOrThrow();

    const referenceKeyNode = new FieldQueryNode(sourceNode, field.getReferenceKeyFieldOrThrow());
    const listItemVar = new VariableQueryNode(field.name);
    const itemKeyNode = createFieldNode(keyFieldInReferencedEntity, listItemVar);
    const equalFilterNode = new BinaryOperationQueryNode(
        itemKeyNode,
        BinaryOperator.EQUAL,
        referenceKeyNode,
    );
    // this is a hint for the database that we're not interested in items where the key is null so it can use sparse
    // indices. this is used by arangodb >= 3.4. It would be preferable to implement this in the ArangoDBAdapter, but
    // then we would need a way to convey non-nullness somehow.
    const nonNullFilterNode = new BinaryOperationQueryNode(
        itemKeyNode,
        BinaryOperator.UNEQUAL,
        NullQueryNode.NULL,
    );
    const filterNode = and(nonNullFilterNode, equalFilterNode);

    const listNode = new EntitiesQueryNode(referencedEntityType);
    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode,
        maxCount: 1,
        itemVariable: listItemVar,
    });
    const rawNode = new FirstOfListQueryNode(filteredListNode);
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(referenceKeyNode, BasicType.NULL),
        NullQueryNode.NULL,
        rawNode,
    );
}

function createTo1RelationNode(field: Field, sourceNode: QueryNode): QueryNode {
    const relationSide = field.getRelationSideOrThrow();
    const followNode = new FollowEdgeQueryNode(relationSide, sourceNode);
    return new FirstOfListQueryNode(followNode);
}

function createToNRelationNode(field: Field, sourceNode: QueryNode): QueryNode {
    const relationSide = field.getRelationSideOrThrow();
    return new FollowEdgeQueryNode(relationSide, sourceNode);
}

function createSafeListQueryNode(listNode: QueryNode) {
    return new SafeListQueryNode(listNode);
}
