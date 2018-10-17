import { Type } from '../../model';
import { ConstBoolQueryNode, QueryNode, TransformListQueryNode, VariableQueryNode } from '../../query-tree';
import { FILTER_ARG } from '../../schema/constants';
import { decapitalize } from '../../utils/utils';
import { FilterObjectType } from '../filter-input-types';

export function buildFilteredListNode(listNode: QueryNode, args: { [name: string]: any }, filterType: FilterObjectType, itemType: Type) {
    const filterValue = args[FILTER_ARG] || {};
    const itemVariable = new VariableQueryNode(decapitalize(itemType.name));
    const filterNode = filterType.getFilterNode(itemVariable, filterValue);

    // avoid unnecessary TransformLists especially for count queries, so that it can be optimized to LENGTH(collection)
    if (filterNode === ConstBoolQueryNode.TRUE) {
        return listNode;
    }

    return new TransformListQueryNode({
        listNode,
        itemVariable,
        filterNode
    });
}
