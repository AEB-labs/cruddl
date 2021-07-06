import { RootEntityType } from '../../model/implementation';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    EntityFromIdQueryNode,
    ListQueryNode,
    LiteralQueryNode,
    QueryNode,
    RootEntityIDQueryNode,
    TransformListQueryNode,
    VariableQueryNode
} from '../../query-tree';

export function getMapNode(listNode: QueryNode, projection: (itemNode: QueryNode) => QueryNode) {
    if (listNode instanceof ListQueryNode) {
        if (listNode.itemNodes.length === 0) {
            return listNode;
        }
        if (listNode.itemNodes.length === 1) {
            return new ListQueryNode([projection(listNode.itemNodes[0])]);
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

export function mapToIDNodesWithOptimizations(listNode: QueryNode): QueryNode {
    // if the listNode is just an EQUALS/IN filter on root entity id, we can statically determine the ids
    if (listNode instanceof TransformListQueryNode) {
        if (
            listNode.innerNode === listNode.itemVariable &&
            !listNode.skip &&
            listNode.filterNode instanceof BinaryOperationQueryNode
        ) {
            const filterNode = listNode.filterNode;
            if (
                filterNode instanceof BinaryOperationQueryNode &&
                filterNode.lhs instanceof RootEntityIDQueryNode &&
                filterNode.lhs.objectNode === listNode.itemVariable
            ) {
                if (filterNode.operator === BinaryOperator.EQUAL && filterNode.rhs instanceof LiteralQueryNode) {
                    // maxCount is not inspected because ids are always unique
                    return new ListQueryNode([filterNode.rhs]);
                }
                if (
                    filterNode.operator === BinaryOperator.IN &&
                    filterNode.rhs instanceof LiteralQueryNode &&
                    Array.isArray(filterNode.rhs.value)
                ) {
                    if (listNode.maxCount == undefined) {
                        return filterNode.rhs;
                    } else if (listNode.orderBy.isUnordered()) {
                        return new LiteralQueryNode(filterNode.rhs.value.slice(0, listNode.maxCount));
                    }
                }
            }
        }
    }

    return mapToIDNodesUnoptimized(listNode);
}

export function mapToIDNodesUnoptimized(listNode: QueryNode): QueryNode {
    return getMapNode(listNode, itemNode => new RootEntityIDQueryNode(itemNode));
}

export function mapIDsToRootEntities(idsNode: QueryNode, rootEntityType: RootEntityType): QueryNode {
    const idVar = new VariableQueryNode('id');
    return new TransformListQueryNode({
        listNode: idsNode,
        itemVariable: idVar,
        innerNode: new EntityFromIdQueryNode(rootEntityType, idVar)
    });
}
