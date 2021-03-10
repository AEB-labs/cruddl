import { GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import { Type } from '../model';
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConcatListsQueryNode,
    ConstBoolQueryNode,
    INVALID_CURSOR_ERROR,
    LiteralQueryNode,
    NOT_SUPPORTED_ERROR,
    OrderDirection,
    OrderSpecification,
    QueryNode,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableQueryNode
} from '../query-tree';
import { FlexSearchQueryNode } from '../query-tree/flex-search';
import {
    AFTER_ARG,
    CURSOR_FIELD,
    FIRST_ARG,
    ID_FIELD,
    ORDER_BY_ARG,
    ORDER_BY_ASC_SUFFIX,
    SKIP_ARG
} from '../schema/constants';
import { decapitalize } from '../utils/utils';
import { OrderByEnumGenerator, OrderByEnumType, OrderByEnumValue } from './order-by-enum-generator';
import { QueryNodeField } from './query-node-object-type';
import { orderArgMatchesPrimarySort } from './utils/flex-search-utils';
import { and } from './utils/input-types';
import { getOrderByValues } from './utils/pagination';

/**
 * Augments list fields with orderBy argument
 */
export class OrderByAndPaginationAugmentation {
    constructor(private readonly orderByEnumGenerator: OrderByEnumGenerator) {}

    augment(schemaField: QueryNodeField, type: Type): QueryNodeField {
        if (!type.isObjectType) {
            return schemaField;
        }

        const orderByType = this.orderByEnumGenerator.generate(type);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                ...(orderByType
                    ? {
                          [ORDER_BY_ARG]: {
                              type: new GraphQLList(new GraphQLNonNull(orderByType.getEnumType())),
                              description:
                                  `Specifies the how this ${
                                      type.isRootEntityType ? 'collection' : 'list'
                                  } should be sorted. If omitted, ` +
                                  (type.isRootEntityType
                                      ? `the result order is not specified. `
                                      : `the order of the list in the object is preserved. `) +
                                  (type.isRootEntityType || type.isChildEntityType
                                      ? `If cursor-based pagination is used (i.e., the \`${AFTER_ARG}\` is specified or the \`${CURSOR_FIELD}\` is requested), \`${ID_FIELD}${ORDER_BY_ASC_SUFFIX}\` will be implicitly added as last sort criterion so that the sort order is deterministic.`
                                      : `When using cursor-based pagination, ensure that you specify a field with unique values so that the order is deterministic.`)
                          },
                          [AFTER_ARG]: {
                              type: GraphQLString,
                              description: `If this is set to the value of the \`${CURSOR_FIELD}\` field of an item, only items after that one will be included in the result. The value of the \`${AFTER_ARG}\` of this query must match the one where the \`${CURSOR_FIELD}\` value has been retrieved from.`
                          }
                      }
                    : {}),
                [SKIP_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items in the list or collection to skip. Is applied after the \`${AFTER_ARG}\` argument if both are specified.`
                },
                [FIRST_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items to include in the result. If omitted, all remaining items will be included (which can cause performance problems on large collections).`
                }
            },
            resolve: (sourceNode, args, info) => {
                let listNode = schemaField.resolve(sourceNode, args, info);
                let itemVariable = new VariableQueryNode(decapitalize(type.name));

                const maxCount: number | undefined = args[FIRST_ARG];
                const skip = args[SKIP_ARG];
                const afterArg = args[AFTER_ARG];
                const isCursorRequested = info.selectionStack[
                    info.selectionStack.length - 1
                ].fieldRequest.selectionSet.some(sel => sel.fieldRequest.field.name === CURSOR_FIELD);
                // we only require the absolute ordering for cursor-based pagination, which is detected via a cursor field or the "after" argument.
                const isAbsoluteOrderRequired = isCursorRequested || !!afterArg;
                let orderByValues: ReadonlyArray<OrderByEnumValue>;
                let paginationFilter: QueryNode | undefined;

                // if we can, just extend a given TransformListNode so that other cruddl optimizations can operate
                // (e.g. projection indirection)
                let filterNode: QueryNode | undefined;
                const originalListNode = listNode;
                if (
                    listNode instanceof TransformListQueryNode &&
                    listNode.skip === 0 &&
                    listNode.orderBy.isUnordered() &&
                    listNode.maxCount == undefined &&
                    listNode.innerNode === listNode.itemVariable
                ) {
                    filterNode = listNode.filterNode.equals(ConstBoolQueryNode.TRUE) ? undefined : listNode.filterNode;
                    itemVariable = listNode.itemVariable;
                    listNode = listNode.listNode;
                }

                // flexsearch?
                let leaveUnordered = false;
                if (listNode instanceof FlexSearchQueryNode) {
                    if (!orderByType) {
                        throw new Error(`OrderBy type missing for flex search`);
                    }
                    // whenever possible, use primary sort
                    if (orderArgMatchesPrimarySort(args[ORDER_BY_ARG], listNode.rootEntityType.flexSearchPrimarySort)) {
                        // this would be cleaner if the primary sort was actually parsed into a ModelComponent (see e.g. the Index and IndexField classes)
                        orderByValues = listNode.rootEntityType.flexSearchPrimarySort.map(clause =>
                            orderByType.getValueOrThrow(
                                clause.field.path.replace('.', '_') +
                                    (clause.direction === OrderDirection.ASCENDING ? '_ASC' : '_DESC')
                            )
                        );
                        leaveUnordered = true;
                    } else {
                        // this will generate a SORT clause that's not covered by the flexsearch index,
                        // but the TooManyObject check of flex-search-generator already handles this case to throw
                        // a TooManyObjects error if needed.
                        orderByValues = getOrderByValues(args, orderByType, { isAbsoluteOrderRequired });
                    }

                    // for now, cursor-based pagination is only allowed when we can use flexsearch filters for the
                    // paginationFilter. This simplifies the implementation, but maybe we should support it in the
                    // future for consistency. Then however we need to adjust the too-many-objects check
                    // do this check also if cursor is just requested so we get this error on the first page
                    if (isCursorRequested || !!afterArg) {
                        const violatingClauses = orderByValues.filter(val =>
                            val.path.some(field => !field.isFlexSearchIndexed)
                        );
                        if (violatingClauses.length) {
                            return new RuntimeErrorQueryNode(
                                `Cursor-based pagination is not supported with order clause "${violatingClauses[0].name}" because it is not flex-search indexed`,
                                {
                                    code: NOT_SUPPORTED_ERROR
                                }
                            );
                        }
                    }

                    // TODO maybe we should use the FLEX_LESS_THAN operators etc. on string-based fields
                    // however, it's currently only used on String and not on e.g. DateTime and no longer seems to make a difference
                    const flexPaginationFilter = this.createPaginationFilterNode({
                        afterArg,
                        itemNode: listNode.itemVariable,
                        orderByValues
                    });
                    listNode = new FlexSearchQueryNode({
                        ...listNode,
                        flexFilterNode: flexPaginationFilter
                            ? and(listNode.flexFilterNode, flexPaginationFilter)
                            : listNode.flexFilterNode,

                        // pagination filters generate nested AND-OR structures that overwhelm the optimizer
                        isOptimisationsDisabled: listNode.isOptimisationsDisabled || !!flexPaginationFilter
                    });
                } else {
                    orderByValues = !orderByType
                        ? []
                        : getOrderByValues(args, orderByType, { isAbsoluteOrderRequired });
                    paginationFilter = this.createPaginationFilterNode({
                        afterArg,
                        itemNode: itemVariable,
                        orderByValues
                    });
                }

                const orderBy =
                    !orderByType || leaveUnordered
                        ? OrderSpecification.UNORDERED
                        : new OrderSpecification(orderByValues.map(value => value.getClause(itemVariable)));

                if (orderBy.isUnordered() && maxCount == undefined && paginationFilter === ConstBoolQueryNode.TRUE) {
                    return originalListNode;
                }

                // There is no way to specify LIMIT with an offset but without count properly, and specifying a huge
                // count would still trigger the constrained-heap optimization for flexsearch views which would OOM
                // https://arangodb.atlassian.net/servicedesk/customer/portal/10/DEVSUP-625
                // https://github.com/AEB-labs/cruddl/pull/171#issuecomment-669032789
                if (
                    listNode instanceof FlexSearchQueryNode &&
                    skip &&
                    maxCount === undefined &&
                    !orderBy.isUnordered()
                ) {
                    return new RuntimeErrorQueryNode(
                        `Using "skip" without "first" in combination with "orderBy" or cursor-based pagination is not supported on flex search queries.`,
                        {
                            code: NOT_SUPPORTED_ERROR
                        }
                    );
                }

                if (
                    !(listNode instanceof FlexSearchQueryNode) &&
                    !skip &&
                    maxCount != undefined &&
                    orderBy.clauses.length > 1 &&
                    afterArg &&
                    type.isRootEntityType &&
                    orderByType
                ) {
                    // optimization that makes use of an index that spans multiple order fields
                    // see https://github.com/arangodb/arangodb/issues/2357
                    // TODO only really do this here if there is an index covering this
                    // (however, it's not that easy - it needs to include the filter stuff that is already baked into
                    // listNode)
                    return this.getPaginatedNodeUsingMultiIndexOptimization({
                        orderBy,
                        itemVariable,
                        orderByType,
                        listNode,
                        args,
                        maxCount,
                        filterNode
                    });
                }

                return new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    orderBy,
                    skip,
                    maxCount,
                    filterNode:
                        filterNode && paginationFilter
                            ? and(filterNode, paginationFilter)
                            : filterNode || paginationFilter
                });
            }
        };
    }

    private getPaginatedNodeUsingMultiIndexOptimization({
        args,
        orderByType,
        itemVariable,
        listNode,
        orderBy,
        maxCount,
        filterNode
    }: {
        args: { [name: string]: any };
        orderByType: OrderByEnumType;
        itemVariable: VariableQueryNode;
        listNode: QueryNode;
        orderBy: OrderSpecification;
        maxCount: number | undefined;
        filterNode: QueryNode | undefined;
    }) {
        const afterArg = args[AFTER_ARG];
        let cursorObj: any;
        try {
            cursorObj = JSON.parse(afterArg);
            if (typeof cursorObj != 'object' || cursorObj === null) {
                return new RuntimeErrorQueryNode('The JSON value provided as "after" argument is not an object', {
                    code: INVALID_CURSOR_ERROR
                });
            }
        } catch (e) {
            return new RuntimeErrorQueryNode(
                `Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`,
                { code: INVALID_CURSOR_ERROR }
            );
        }

        let currentEqualityChain: QueryNode | undefined = filterNode;
        const orderByValues = getOrderByValues(args, orderByType, { isAbsoluteOrderRequired: true });
        const partLists: TransformListQueryNode[] = [];
        for (const clause of orderByValues) {
            const cursorProperty = clause.underscoreSeparatedPath;
            if (!(cursorProperty in cursorObj)) {
                return new RuntimeErrorQueryNode(
                    `Invalid cursor supplied to "after": Property "${cursorProperty}" missing. Make sure this cursor has been obtained with the same orderBy clause.`,
                    { code: INVALID_CURSOR_ERROR }
                );
            }
            const cursorValue = cursorObj[cursorProperty];
            const valueNode = clause.getValueNode(itemVariable);

            const operator =
                clause.direction == OrderDirection.ASCENDING ? BinaryOperator.GREATER_THAN : BinaryOperator.LESS_THAN;
            const unequalityNode = new BinaryOperationQueryNode(valueNode, operator, new LiteralQueryNode(cursorValue));
            const filterNode = currentEqualityChain ? and(currentEqualityChain, unequalityNode) : unequalityNode;
            const nextEqualityNode = new BinaryOperationQueryNode(
                valueNode,
                BinaryOperator.EQUAL,
                new LiteralQueryNode(cursorValue)
            );
            currentEqualityChain = currentEqualityChain
                ? and(currentEqualityChain, nextEqualityNode)
                : nextEqualityNode;

            const partListNode = new TransformListQueryNode({
                listNode,
                itemVariable,
                orderBy,
                maxCount,
                filterNode
            });
            partLists.push(partListNode);
        }

        return new TransformListQueryNode({
            listNode: new ConcatListsQueryNode(partLists),
            itemVariable,
            orderBy,
            maxCount
        });
    }

    private createPaginationFilterNode({
        afterArg,
        itemNode,
        orderByValues
    }: {
        readonly afterArg: string;
        readonly itemNode: QueryNode;
        readonly orderByValues: ReadonlyArray<OrderByEnumValue>;
    }): QueryNode | undefined {
        if (!afterArg) {
            return undefined;
        }

        let cursorObj: any;
        try {
            cursorObj = JSON.parse(afterArg);
            if (typeof cursorObj != 'object' || cursorObj === null) {
                return new RuntimeErrorQueryNode('The JSON value provided as "after" argument is not an object', {
                    code: INVALID_CURSOR_ERROR
                });
            }
        } catch (e) {
            return new RuntimeErrorQueryNode(
                `Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`,
                { code: INVALID_CURSOR_ERROR }
            );
        }

        // Make sure we only select items after the cursor
        // Thus, we need to implement the 'comparator' based on the order-by-specification
        // Haskell-like pseudo-code because it's easier ;-)
        // filterForClause :: Clause[] -> FilterNode:
        // filterForClause([{field, ASC}, ...tail]) =
        //   (context[clause.field] > cursor[clause.field] || (context[clause.field] == cursor[clause.field] && filterForClause(tail))
        // filterForClause([{field, DESC}, ...tail]) =
        //   (context[clause.field] < cursor[clause.field] || (context[clause.field] == cursor[clause.field] && filterForClause(tail))
        // filterForClause([]) = FALSE # arbitrary; if order is absolute, this case should never occur
        function filterForClause(clauses: ReadonlyArray<OrderByEnumValue>): QueryNode {
            if (clauses.length == 0) {
                return new ConstBoolQueryNode(false);
            }

            const clause = clauses[0];
            const cursorProperty = clause.underscoreSeparatedPath;
            if (!(cursorProperty in cursorObj)) {
                return new RuntimeErrorQueryNode(
                    `Invalid cursor supplied to "after": Property "${cursorProperty}" missing. Make sure this cursor has been obtained with the same orderBy clause.`,
                    { code: INVALID_CURSOR_ERROR }
                );
            }
            const cursorValue = cursorObj[cursorProperty];
            const valueNode = clause.getValueNode(itemNode);

            const operator =
                clause.direction == OrderDirection.ASCENDING ? BinaryOperator.GREATER_THAN : BinaryOperator.LESS_THAN;
            return new BinaryOperationQueryNode(
                new BinaryOperationQueryNode(valueNode, operator, new LiteralQueryNode(cursorValue)),
                BinaryOperator.OR,
                new BinaryOperationQueryNode(
                    new BinaryOperationQueryNode(valueNode, BinaryOperator.EQUAL, new LiteralQueryNode(cursorValue)),
                    BinaryOperator.AND,
                    filterForClause(clauses.slice(1))
                )
            );
        }

        return filterForClause(orderByValues);
    }
}
