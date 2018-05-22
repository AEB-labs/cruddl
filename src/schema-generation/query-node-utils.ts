import {
    BasicType, ConditionalQueryNode, ListQueryNode, QueryNode, TypeCheckQueryNode, VariableQueryNode
} from '../query-tree';

export function buildSafeListQueryNode(listNode: QueryNode) {
    // to avoid errors because of eagerly evaluated list expression, we just convert non-lists to an empty list
    return new ConditionalQueryNode(
        new TypeCheckQueryNode(listNode, BasicType.LIST),
        listNode,
        new ListQueryNode([])
    );
}
