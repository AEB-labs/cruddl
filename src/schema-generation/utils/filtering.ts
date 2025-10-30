import { Type } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    QueryNode,
    TransformListQueryNode,
    TraversalQueryNode,
    TraversalQueryNodeParams,
    VariableQueryNode,
} from '../../query-tree';
import { simplifyBooleans } from '../../query-tree/utils';
import { FILTER_ARG } from '../../schema/constants';
import { decapitalize } from '../../utils/utils';
import { FilterObjectType } from '../filter-input-types';
import { RequireAllProperties } from '../../utils/util-types';

interface BuildFilteredListNodeParams {
    readonly listNode: QueryNode;
    readonly filterValue: any;
    readonly filterType: FilterObjectType;
    readonly itemType: Type;
}

export function buildFilteredListNode({ listNode, ...params }: BuildFilteredListNodeParams) {
    const filterValue = params.filterValue || {};
    const existingItemVariable =
        listNode instanceof TraversalQueryNode ? listNode.itemVariable : undefined;
    const itemVariable =
        existingItemVariable ?? new VariableQueryNode(decapitalize(params.itemType.name));
    // simplification is important for the shortcut with check for TRUE below in the case of e.g. { AND: [] }
    const filterNode = simplifyBooleans(params.filterType.getFilterNode(itemVariable, filterValue));

    // avoid unnecessary TransformLists especially for count queries, so that it can be optimized to LENGTH(collection)
    if (filterNode === ConstBoolQueryNode.TRUE) {
        return listNode;
    }

    if (listNode instanceof TraversalQueryNode) {
        const effectiveFilterNode = listNode.filterNode
            ? new BinaryOperationQueryNode(listNode.filterNode, BinaryOperator.AND, filterNode)
            : filterNode;

        return new TraversalQueryNode({
            entitiesIdentifierKind: listNode.entitiesIdentifierKind,
            sourceEntityNode: listNode.sourceEntityNode,
            relationSegments: listNode.relationSegments,
            fieldSegments: listNode.fieldSegments,
            sourceIsList: listNode.sourceIsList,
            alwaysProduceList: listNode.alwaysProduceList,
            preserveNullValues: listNode.preserveNullValues,
            innerNode: listNode.innerNode,
            rootEntityVariable: listNode.rootEntityVariable,
            orderBy: listNode.orderBy,
            skip: listNode.skip,
            maxCount: listNode.maxCount,

            itemVariable,
            filterNode: effectiveFilterNode,
        } satisfies RequireAllProperties<TraversalQueryNodeParams>);
    }

    // TODO NXT-7991-later also merge with existing TransformListQueryNode if any
    return new TransformListQueryNode({
        listNode,
        itemVariable,
        filterNode,
    });
}

export function getFilterNode(listNode: QueryNode, predicate: (itemNode: QueryNode) => QueryNode) {
    if (listNode instanceof TransformListQueryNode) {
        return new TransformListQueryNode({
            ...listNode,
            filterNode: new BinaryOperationQueryNode(
                listNode.filterNode,
                BinaryOperator.AND,
                predicate(listNode.itemVariable),
            ),
        });
    }

    const itemVariable = new VariableQueryNode('item');
    const filterNode = predicate(itemVariable);
    return new TransformListQueryNode({
        listNode,
        itemVariable,
        filterNode,
    });
}
