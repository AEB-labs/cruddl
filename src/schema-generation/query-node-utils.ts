import {
    BasicType, ConditionalQueryNode, FollowEdgeQueryNode, ListQueryNode, QueryNode, TransformListQueryNode,
    TypeCheckQueryNode
} from '../query-tree';

export function buildSafeListQueryNode(listNode: QueryNode) {
    if (listNode instanceof ListQueryNode || listNode instanceof TransformListQueryNode || listNode instanceof FollowEdgeQueryNode) {
        // shortcut, especially useful if filter, mapping etc. are done separately
        return listNode;
    }

    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );
}
