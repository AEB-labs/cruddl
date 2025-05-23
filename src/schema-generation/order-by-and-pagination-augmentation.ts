import { GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql';
import { ExecutionOptions } from '../execution/execution-options';
import { Type } from '../model';
import {
    ARGUMENT_OUT_OF_RANGE_ERROR,
    BinaryOperationQueryNode,
    BinaryOperator,
    BinaryOperatorWithAnalyzer,
    ConcatListsQueryNode,
    ConstBoolQueryNode,
    INVALID_CURSOR_ERROR,
    LiteralQueryNode,
    NOT_SUPPORTED_ERROR,
    NoImplicitlyTruncatedListValidator,
    OrderDirection,
    OrderSpecification,
    PreExecQueryParms,
    QueryNode,
    RuntimeError,
    RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableQueryNode,
    WithPreExecutionQueryNode,
} from '../query-tree';
import { FlexSearchQueryNode } from '../query-tree/flex-search';
import {
    AFTER_ARG,
    CURSOR_FIELD,
    FIRST_ARG,
    ID_FIELD,
    INPUT_FIELD_EQUAL,
    INPUT_FIELD_GT,
    INPUT_FIELD_LT,
    ORDER_BY_ARG,
    ORDER_BY_ASC_SUFFIX,
    SKIP_ARG,
} from '../schema/constants';
import { decapitalize } from '../utils/utils';
import {
    FlexSearchScalarOrEnumFilterField,
    resolveFilterField,
} from './flex-search-filter-input-types/filter-fields';
import { OrderByEnumGenerator, OrderByEnumType, OrderByEnumValue } from './order-by-enum-generator';
import { QueryNodeField } from './query-node-object-type';
import { RootFieldHelper } from './root-field-helper';
import { and, binaryOp, binaryOpWithAnaylzer } from './utils/input-types';
import { getOrderByValues } from './utils/pagination';
import {
    getSortClausesForPrimarySort,
    orderArgMatchesPrimarySort,
} from './utils/flex-search-utils';

export enum LimitTypeCheckType {
    RESULT_VALIDATOR = 'RESULT_VALIDATOR',
    RESOLVER = 'RESOLVER',
}

export interface OrderByAndPaginationAugmentationOptions {
    firstLimitCheckType?: LimitTypeCheckType;
    operation?: 'query' | 'mutation';
}

/**
 * Augments list fields with orderBy argument
 */
export class OrderByAndPaginationAugmentation {
    constructor(
        private readonly orderByEnumGenerator: OrderByEnumGenerator,
        private readonly rootFieldHelper: RootFieldHelper,
    ) {}

    augment(
        schemaField: QueryNodeField,
        type: Type,
        options: OrderByAndPaginationAugmentationOptions = {},
    ): QueryNodeField {
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
                                      : `When using cursor-based pagination, ensure that you specify a field with unique values so that the order is deterministic.`),
                          },
                          [AFTER_ARG]: {
                              type: GraphQLString,
                              description: `If this is set to the value of the \`${CURSOR_FIELD}\` field of an item, only items after that one will be included in the result. The value of the \`${AFTER_ARG}\` of this query must match the one where the \`${CURSOR_FIELD}\` value has been retrieved from.`,
                          },
                      }
                    : {}),
                [SKIP_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items in the list or collection to skip. Is applied after the \`${AFTER_ARG}\` argument if both are specified.`,
                },
                [FIRST_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items to include in the result. If omitted, all remaining items will be included (which can cause performance problems on large collections).`,
                },
            },
            transformResult: (data: any, args: object, executionOptions: ExecutionOptions) => {
                if (
                    options.firstLimitCheckType !== LimitTypeCheckType.RESOLVER ||
                    'first' in args
                ) {
                    return data;
                }
                if (
                    executionOptions.implicitLimitForRootEntityQueries &&
                    data.length > executionOptions.implicitLimitForRootEntityQueries
                ) {
                    throw new RuntimeError(
                        `Collection is truncated by default to ${executionOptions.implicitLimitForRootEntityQueries} elements but contains more elements than this limit. Specify a limit manually to retrieve all elements of the collection.`,
                    );
                }
                return data;
            },
            resolve: (sourceNode, args, info) => {
                let listNode = schemaField.resolve(sourceNode, args, info);
                let itemVariable = new VariableQueryNode(decapitalize(type.name));
                let objectNode = this.rootFieldHelper.getRealItemNode(itemVariable, info);

                let maxCount: number | undefined = args[FIRST_ARG];

                if (
                    options.firstLimitCheckType &&
                    info.maxLimitForRootEntityQueries &&
                    maxCount !== undefined &&
                    maxCount > info.maxLimitForRootEntityQueries
                ) {
                    return new RuntimeErrorQueryNode(
                        `The requested number of elements via the \"first\" parameter (${maxCount}) exceeds the maximum limit of ${info.maxLimitForRootEntityQueries}.`,
                        { code: ARGUMENT_OUT_OF_RANGE_ERROR },
                    );
                }

                let wrapQueryNodeInResultValidator = false;

                if (
                    options.firstLimitCheckType &&
                    info.implicitLimitForRootEntityQueries &&
                    maxCount === undefined
                ) {
                    maxCount = info.implicitLimitForRootEntityQueries + 1;
                    if (options.firstLimitCheckType === LimitTypeCheckType.RESULT_VALIDATOR) {
                        wrapQueryNodeInResultValidator = true;
                    }
                }

                const skip = args[SKIP_ARG];
                const afterArg = args[AFTER_ARG];
                const isCursorRequested = info.selectionStack[
                    info.selectionStack.length - 1
                ].fieldRequest.selectionSet.some(
                    (sel) => sel.fieldRequest.field.name === CURSOR_FIELD,
                );
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
                    filterNode = listNode.filterNode.equals(ConstBoolQueryNode.TRUE)
                        ? undefined
                        : listNode.filterNode;
                    itemVariable = listNode.itemVariable;
                    objectNode = this.rootFieldHelper.getRealItemNode(itemVariable, info);
                    listNode = listNode.listNode;
                }

                // flexsearch?
                // we only offer cursor-based pagination if we can cover all required filters with flex search filters
                // this means we just replace the flexsearch listNode with a flexsearch listNode that does the cursor-filtering
                if (listNode instanceof FlexSearchQueryNode) {
                    if (!orderByType) {
                        throw new Error(`OrderBy type missing for flex search`);
                    }
                    // we used to remove the sort clause if it matched the primary sort, but it turned out this is not
                    // ok. If the sorting matches the primary sort, sorting is efficient, but you still need to specify
                    // it, otherwise, sometimes the order can be wrong (after inserting or updating documents).

                    // flexsearch is mostly used in tables, where a consistent absolute sort order is important
                    // At the same time, primary sort is relatively cheap to use (in a test with primed caches on
                    // 10 million objects, slowdown was 9% (after warmup), and the whole operation was still sub-millisecond)
                    // for this reason, we guarantee an absolute, well-defined sort ordering at all times in flexsearch
                    // - if possible (does not contradict orderBy), we use the primarySort, which is very fast
                    // - if not possible, sorting will happen in-memory anyway, so it does not hurt to make it absolute
                    if (
                        orderArgMatchesPrimarySort(
                            args[ORDER_BY_ARG],
                            listNode.rootEntityType.flexSearchPrimarySort,
                        )
                    ) {
                        // note that the primary sort always has an absolute order
                        // (there is special logic in RootEntityType to guarantee this)
                        orderByValues = getSortClausesForPrimarySort(
                            listNode.rootEntityType,
                            orderByType,
                        );
                    } else {
                        // this will generate a SORT clause that is not covered by the primary sort,
                        // so sorting will happen purely in memory.
                        // FlexSearchGenerator.augmentWithCondition will add a check to throw a
                        // FLEX_SEARCH_TOO_MANY_OBJECTS error if there are too many objects to sort in memory
                        // (it has the same orderArgMatchesPrimarySort-based logic)
                        orderByValues = getOrderByValues(args, orderByType, {
                            // Since we're already sorting in-memory, it does not hurt to make this ordering absolute
                            isAbsoluteOrderRequired: true,
                        });
                    }

                    // Cursor-based pagination is only allowed when we can use flexsearch filters for the
                    // paginationFilter. Otherwise, we would need a postFilter for the "after" arg,
                    // and that could lead to bad performance / TOO_MANY_OBJECTS error. Better be
                    // consistent and outright disallow cursor-based pagination in this case
                    if (isCursorRequested || afterArg) {
                        const violatingClauses = orderByValues.filter((val) =>
                            val.path.some((field) => !field.isFlexSearchIndexed),
                        );
                        if (violatingClauses.length) {
                            return new RuntimeErrorQueryNode(
                                `Cursor-based pagination is not supported with order clause "${violatingClauses[0].name}" because it is not flex-search indexed`,
                                {
                                    code: NOT_SUPPORTED_ERROR,
                                },
                            );
                        }
                    }

                    // TODO maybe we should use the FLEX_LESS_THAN operators etc. on string-based fields
                    // however, it's currently only used on String and not on e.g. DateTime and no longer seems to make a difference
                    const flexPaginationFilter = this.createPaginationFilterNode({
                        afterArg,
                        // pagination acts on the listNode (which is a FlexSearchQueryNode) and not on the resulting
                        // TransformListQueryNode, so we need to use listNode.itemVariable in the pagination filter
                        itemNode: this.rootFieldHelper.getRealItemNode(listNode.itemVariable, info),
                        orderByValues,
                        isFlexSearch: true,
                    });
                    listNode = new FlexSearchQueryNode({
                        ...listNode,
                        flexFilterNode: flexPaginationFilter
                            ? and(listNode.flexFilterNode, flexPaginationFilter)
                            : listNode.flexFilterNode,

                        // pagination filters generate nested AND-OR structures that overwhelm the optimizer
                        isOptimisationsDisabled:
                            listNode.isOptimisationsDisabled || !!flexPaginationFilter,
                    });
                } else {
                    // not flex search
                    orderByValues = !orderByType
                        ? []
                        : getOrderByValues(args, orderByType, { isAbsoluteOrderRequired });
                    paginationFilter = this.createPaginationFilterNode({
                        afterArg,
                        itemNode: objectNode,
                        orderByValues,
                        isFlexSearch: false,
                    });
                }

                // sorting always happens on the TransformListQueryNode and not in the FlexSearchQueryNode
                const orderBy = !orderByType
                    ? OrderSpecification.UNORDERED
                    : new OrderSpecification(
                          orderByValues.map((value) => value.getClause(objectNode)),
                      );

                if (
                    orderBy.isUnordered() &&
                    maxCount == undefined &&
                    paginationFilter === ConstBoolQueryNode.TRUE
                ) {
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
                            code: NOT_SUPPORTED_ERROR,
                        },
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
                    const optimizedQueryNode = this.getPaginatedNodeUsingMultiIndexOptimization({
                        orderBy,
                        itemVariable,
                        objectNode,
                        orderByType,
                        listNode,
                        args,
                        maxCount,
                        filterNode,
                    });

                    if (
                        options.firstLimitCheckType === LimitTypeCheckType.RESULT_VALIDATOR &&
                        options.operation &&
                        args[FIRST_ARG] === undefined
                    ) {
                        return this.wrapWithImplicitListTruncationResultValidator(
                            optimizedQueryNode,
                            maxCount,
                            options.operation,
                        );
                    }

                    return optimizedQueryNode;
                }

                const transformListNode = new TransformListQueryNode({
                    listNode,
                    itemVariable,
                    orderBy,
                    skip,
                    maxCount,
                    filterNode:
                        filterNode && paginationFilter
                            ? and(filterNode, paginationFilter)
                            : filterNode || paginationFilter,
                });

                if (wrapQueryNodeInResultValidator && options.operation) {
                    return this.wrapWithImplicitListTruncationResultValidator(
                        transformListNode,
                        info.implicitLimitForRootEntityQueries!,
                        options.operation,
                    );
                }

                return transformListNode;
            },
        };
    }

    private wrapWithImplicitListTruncationResultValidator(
        queryNode: QueryNode,
        maxCount: number,
        operation: string,
    ): QueryNode {
        const v = new VariableQueryNode();
        return new WithPreExecutionQueryNode({
            preExecQueries: [
                new PreExecQueryParms({
                    query: queryNode,
                    resultVariable: v,
                    resultValidator: new NoImplicitlyTruncatedListValidator(maxCount, operation),
                }),
            ],
            resultNode: v,
        });
    }

    private getPaginatedNodeUsingMultiIndexOptimization({
        args,
        orderByType,
        itemVariable,
        objectNode,
        listNode,
        orderBy,
        maxCount,
        filterNode,
    }: {
        args: { [name: string]: any };
        orderByType: OrderByEnumType;
        itemVariable: VariableQueryNode;
        objectNode: QueryNode;
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
                return new RuntimeErrorQueryNode(
                    'The JSON value provided as "after" argument is not an object',
                    {
                        code: INVALID_CURSOR_ERROR,
                    },
                );
            }
        } catch (e: any) {
            return new RuntimeErrorQueryNode(
                `Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`,
                { code: INVALID_CURSOR_ERROR },
            );
        }

        let currentEqualityChain: QueryNode | undefined = filterNode;
        const orderByValues = getOrderByValues(args, orderByType, {
            isAbsoluteOrderRequired: true,
        });
        const partLists: TransformListQueryNode[] = [];
        for (const clause of orderByValues) {
            const cursorProperty = clause.underscoreSeparatedPath;
            if (!(cursorProperty in cursorObj)) {
                return new RuntimeErrorQueryNode(
                    `Invalid cursor supplied to "after": Property "${cursorProperty}" missing. Make sure this cursor has been obtained with the same orderBy clause.`,
                    { code: INVALID_CURSOR_ERROR },
                );
            }
            const cursorValue = cursorObj[cursorProperty];
            const valueNode = clause.getValueNode(objectNode);

            const operator =
                clause.direction == OrderDirection.ASCENDING
                    ? BinaryOperator.GREATER_THAN
                    : BinaryOperator.LESS_THAN;
            const unequalityNode = new BinaryOperationQueryNode(
                valueNode,
                operator,
                new LiteralQueryNode(cursorValue),
            );
            const filterNode = currentEqualityChain
                ? and(currentEqualityChain, unequalityNode)
                : unequalityNode;
            const nextEqualityNode = new BinaryOperationQueryNode(
                valueNode,
                BinaryOperator.EQUAL,
                new LiteralQueryNode(cursorValue),
            );
            currentEqualityChain = currentEqualityChain
                ? and(currentEqualityChain, nextEqualityNode)
                : nextEqualityNode;

            const partListNode = new TransformListQueryNode({
                listNode,
                itemVariable,
                orderBy,
                maxCount,
                filterNode,
            });
            partLists.push(partListNode);
        }

        return new TransformListQueryNode({
            listNode: new ConcatListsQueryNode(partLists),
            itemVariable,
            orderBy,
            maxCount,
        });
    }

    private createPaginationFilterNode({
        afterArg,
        itemNode,
        orderByValues,
        isFlexSearch,
    }: {
        readonly afterArg: string;
        readonly itemNode: QueryNode;
        readonly orderByValues: ReadonlyArray<OrderByEnumValue>;
        readonly isFlexSearch: boolean;
    }): QueryNode | undefined {
        if (!afterArg) {
            return undefined;
        }

        let cursorObj: any;
        try {
            cursorObj = JSON.parse(afterArg);
            if (typeof cursorObj != 'object' || cursorObj === null) {
                return new RuntimeErrorQueryNode(
                    'The JSON value provided as "after" argument is not an object',
                    {
                        code: INVALID_CURSOR_ERROR,
                    },
                );
            }
        } catch (e: any) {
            return new RuntimeErrorQueryNode(
                `Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`,
                { code: INVALID_CURSOR_ERROR },
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
                    { code: INVALID_CURSOR_ERROR },
                );
            }
            const cursorValue = cursorObj[cursorProperty];
            const valueNode = clause.getValueNode(itemNode);

            function getComparisonNode(
                operator: BinaryOperator,
                stringOperator: BinaryOperatorWithAnalyzer,
                name: string,
            ) {
                if (isFlexSearch) {
                    const op = clause.lastSegment.isFlexSearchStringBased
                        ? binaryOpWithAnaylzer(stringOperator)
                        : binaryOp(operator);
                    const pseudoFilterField = new FlexSearchScalarOrEnumFilterField(
                        op,
                        name,
                        GraphQLString,
                        false,
                    );
                    return resolveFilterField(
                        pseudoFilterField,
                        valueNode,
                        cursorValue,
                        clause.lastSegment.flexSearchAnalyzer,
                    );
                } else {
                    return new BinaryOperationQueryNode(
                        valueNode,
                        operator,
                        new LiteralQueryNode(cursorValue),
                    );
                }
            }

            // we actually just want a > b and a == b, but with our own interpretation of value order
            // it would arguably be better to move this logic into the ArangoDBAdapter and just use regular binary
            // operators here, but that would be a larger refactoring, so we just re-use the filter field logic here.
            let comparisonNode;
            if (clause.direction === OrderDirection.ASCENDING) {
                comparisonNode = getComparisonNode(
                    BinaryOperator.GREATER_THAN,
                    BinaryOperatorWithAnalyzer.FLEX_STRING_GREATER_THAN,
                    INPUT_FIELD_GT,
                );
            } else {
                comparisonNode = getComparisonNode(
                    BinaryOperator.LESS_THAN,
                    BinaryOperatorWithAnalyzer.FLEX_STRING_LESS_THAN,
                    INPUT_FIELD_LT,
                );
            }
            const equalsNode: QueryNode = getComparisonNode(
                BinaryOperator.EQUAL,
                BinaryOperatorWithAnalyzer.EQUAL,
                INPUT_FIELD_EQUAL,
            );
            return new BinaryOperationQueryNode(
                comparisonNode,
                BinaryOperator.OR,
                new BinaryOperationQueryNode(
                    equalsNode,
                    BinaryOperator.AND,
                    filterForClause(clauses.slice(1)),
                ),
            );
        }

        return filterForClause(orderByValues);
    }
}
