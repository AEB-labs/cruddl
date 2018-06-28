import { ListQueryNode, QueryNode, TransformListQueryNode, VariableQueryNode } from '../../query-tree';

export function getMapNode(listNode: QueryNode, projection: (itemNode: QueryNode) => QueryNode) {
    if (listNode instanceof ListQueryNode) {
        if (listNode.itemNodes.length === 0) {
            return listNode;
        }
        if (listNode.itemNodes.length === 1) {
            return new ListQueryNode([
                projection(listNode.itemNodes[0])
            ]);
        }
    }

    if (listNode instanceof TransformListQueryNode) {
        return new TransformListQueryNode({
            ...listNode,
            innerNode: projection(listNode.innerNode)
        });
    }

    const itemVariable = new VariableQueryNode('item');
    const innerNode = projection(itemVariable);
    return new TransformListQueryNode({
        listNode,
        itemVariable,
        innerNode
    });
}
