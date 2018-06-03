import { Type } from '../../model';
import { QueryNode, TransformListQueryNode, VariableQueryNode } from '../../query-tree';
import { FILTER_ARG } from '../../schema/schema-defaults';
import { decapitalize } from '../../utils/utils';
import { FilterObjectType } from '../filter-input-types';

export function buildFilterQueryNode(listNode: QueryNode, args: {[name: string]: any}, filterType: FilterObjectType, itemType: Type) {
    const filterValue = args[FILTER_ARG];
    if (filterValue == undefined) {
        return listNode;
    }

    const itemVariable = new VariableQueryNode(decapitalize(itemType.name));
    const filterNode = filterValue != undefined ? filterType.getFilterNode(itemVariable, args[FILTER_ARG]) : undefined;
    return new TransformListQueryNode({
        listNode,
        itemVariable,
        filterNode
    });
}
