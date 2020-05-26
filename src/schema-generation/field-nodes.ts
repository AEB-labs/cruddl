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
    PropertyAccessQueryNode,
    QueryNode,
    RootEntityIDQueryNode,
    SafeListQueryNode,
    TransformListQueryNode,
    TraversalQueryNode,
    TypeCheckQueryNode,
    VariableQueryNode
} from '../query-tree';
import { ID_FIELD } from '../schema/constants';
import { GraphQLOffsetDateTime, TIMESTAMP_PROPERTY } from '../schema/scalars/offset-date-time';
import { and } from './utils/input-types';

export function createFieldNode(
    field: Field,
    sourceNode: QueryNode,
    options: { skipNullFallbackForEntityExtensions?: boolean } = {}
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

    if (field.collectPath) {
        if (field.aggregationOperator) {
            const { relationSegments, fieldSegments } = getEffectiveCollectSegments(field.collectPath);
            let items: QueryNode = new TraversalQueryNode(sourceNode, relationSegments, fieldSegments);

            if (field.aggregationOperator === AggregationOperator.COUNT) {
                return new CountQueryNode(items);
            }

            if (
                field.collectPath.resultingType &&
                field.collectPath.resultingType.isScalarType &&
                field.collectPath.resultingType.graphQLScalarType === GraphQLOffsetDateTime
            ) {
                const offsetDateTimeNode = new VariableQueryNode('offsetDateTime');
                items = new TransformListQueryNode({
                    listNode: items,
                    itemVariable: offsetDateTimeNode,
                    innerNode: new PropertyAccessQueryNode(offsetDateTimeNode, TIMESTAMP_PROPERTY)
                });
            }

            // scalar fields should be ordered automatically because there is no argument to sort them
            const sort =
                field.aggregationOperator === AggregationOperator.DISTINCT &&
                (field.type.isScalarType || field.type.isEnumType);
            return new AggregationQueryNode(items, field.aggregationOperator, { sort });
        } else {
            const { relationSegments, fieldSegments } = getEffectiveCollectSegments(field.collectPath);
            return new TraversalQueryNode(sourceNode, relationSegments, fieldSegments);
        }
    }

    if (field.isList) {
        if (field.isRelation) {
            return createToNRelationNode(field, sourceNode);
        }

        // there are no lists of references

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
            ObjectQueryNode.EMPTY
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
    const equalFilterNode = new BinaryOperationQueryNode(itemKeyNode, BinaryOperator.EQUAL, referenceKeyNode);
    // this is a hint for the database that we're not interested in items where the key is null so it can use sparse
    // indices. this is used by arangodb >= 3.4. It would be preferable to implement this in the ArangoDBAdapter, but
    // then we would need a way to convey non-nullness somehow.
    const nonNullFilterNode = new BinaryOperationQueryNode(itemKeyNode, BinaryOperator.UNEQUAL, NullQueryNode.NULL);
    const filterNode = and(nonNullFilterNode, equalFilterNode);

    const listNode = new EntitiesQueryNode(referencedEntityType);
    const filteredListNode = new TransformListQueryNode({
        listNode,
        filterNode,
        maxCount: 1,
        itemVariable: listItemVar
    });
    const rawNode = new FirstOfListQueryNode(filteredListNode);
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(referenceKeyNode, BasicType.NULL),
        NullQueryNode.NULL,
        rawNode
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
