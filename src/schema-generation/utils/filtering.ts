import { Type } from '../../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    QueryNode,
    TransformListQueryNode,
    VariableQueryNode,
} from '../../query-tree';
import { simplifyBooleans } from '../../query-tree/utils';
import { FILTER_ARG } from '../../schema/constants';
import { decapitalize } from '../../utils/utils';
import { FilterObjectType } from '../filter-input-types';

interface BuildFilteredListNodeParams {
    readonly listNode: QueryNode;
    readonly filterValue: any;
    readonly filterType: FilterObjectType;
    readonly itemType: Type;
    readonly objectNodeCallback: (itemNode: QueryNode) => QueryNode;
}

export function buildFilteredListNode(params: BuildFilteredListNodeParams) {
    const filterValue = params.filterValue || {};
    const itemVariable = new VariableQueryNode(decapitalize(params.itemType.name));
    // simplification is important for the shortcut with check for TRUE below in the case of e.g. { AND: [] }
    const objectNode = params.objectNodeCallback(itemVariable);
    const filterNode = simplifyBooleans(params.filterType.getFilterNode(objectNode, filterValue));

    // avoid unnecessary TransformLists especially for count queries, so that it can be optimized to LENGTH(collection)
    if (filterNode === ConstBoolQueryNode.TRUE) {
        return params.listNode;
    }

    return new TransformListQueryNode({
        listNode: params.listNode,
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
