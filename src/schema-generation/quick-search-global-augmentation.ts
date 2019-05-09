import {QuickSearchFilterTypeGenerator} from "./quick-search-filter-input-types/generator";
import {QueryNodeField, QueryNodeResolveInfo} from "./query-node-object-type";
import {RootEntityType} from "../model/implementation";
import {
    AFTER_ARG,
    CURSOR_FIELD,
    FIRST_ARG,
    ORDER_BY_ARG,
    QUICK_SEARCH_EXPRESSION_ARG,
    QUICK_SEARCH_FILTER_ARG,
    SKIP_ARG
} from "../schema/constants";
import {QuickSearchQueryNode} from "../query-tree/quick-search";
import {GraphQLEnumType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString} from "graphql";
import {
    BinaryOperationQueryNode,
    BinaryOperator, ConstBoolQueryNode, LiteralQueryNode, OrderDirection, OrderSpecification,
    QueryNode, RuntimeErrorQueryNode,
    TransformListQueryNode,
    VariableQueryNode
} from "../query-tree";
import {and} from "./filter-input-types/constants";
import {OrderByEnumValue} from "./order-by-enum-generator";
import {chain} from "lodash";
import memorize from "memorize-decorator";

export class QuickSearchGlobalAugmentation{
    constructor(private readonly quickSearchTypeGenerator: QuickSearchFilterTypeGenerator) {

    }

    augment(schemaField: QueryNodeField, itemTypes: ReadonlyArray<RootEntityType>): QueryNodeField {
        const quickSearchFilterable = this.augmentGlobalQuickSearch(schemaField,itemTypes);
        const paged = this.augmentGlobalPaged(quickSearchFilterable,itemTypes);
        if(itemTypes.some(value => value.fields.some(value1 => value1.isSearchable))){
            const quickSearchable = this.augmentQuickSearchSearch(paged, itemTypes);
            return quickSearchable;
        }else{
            return paged;
        }

    }

    private augmentGlobalQuickSearch(schemaField: QueryNodeField, itemTypes: ReadonlyArray<RootEntityType>): QueryNodeField {
        if (!itemTypes.every(value => value.isObjectType)) {
            return schemaField;
        }

        const quickSearchType = this.quickSearchTypeGenerator.generateGlobal(itemTypes);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [QUICK_SEARCH_FILTER_ARG]: {
                    type: quickSearchType.getInputType()
                }
            },
            resolve: (sourceNode, args, info) => {
                let parentNode = schemaField.resolve(sourceNode, args, info);
                if(parentNode instanceof QuickSearchQueryNode){
                    return new QuickSearchQueryNode({
                        entity: parentNode.entity,
                        isGlobal: parentNode.isGlobal,
                        itemVariable: parentNode.itemVariable
                    }); // @MSF GLOBAL TODO: resolver - generate Global-Search-Filter
                }else{
                    throw new Error("Quicksearch Augment only possible on QuickSearchQueryNodes") // @MSF OPT TODO: proper error
                }
            }
        };
    }

    private augmentGlobalPaged(schemaField: QueryNodeField, itemTypes: ReadonlyArray<RootEntityType>): QueryNodeField{
        if (!itemTypes.every(value => value.isObjectType)) {
            return schemaField;
        }

        const orderByType = this.quickSearchTypeGenerator.generateSystemFieldOrderByEnum(itemTypes[0]);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [ORDER_BY_ARG]: {
                    type: new GraphQLList(new GraphQLNonNull(orderByType.getEnumType())),
                    description: `orderby` // @MSF OPT TODO: description
                },
                [SKIP_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items in the list or collection to skip. Is applied after the \`${AFTER_ARG}\` argument if both are specified.`
                },
                [FIRST_ARG]: {
                    type: GraphQLInt,
                    description: `The number of items to include in the result. If omitted, all remaining items will be included (which can cause performance problems on large collections).`
                },
                [AFTER_ARG]: {
                    type: GraphQLString,
                    description: `If this is set to the value of the \`${CURSOR_FIELD}\` field of an item, only items after that one will be included in the result. The value of the \`${AFTER_ARG}\` of this query must match the one where the \`${CURSOR_FIELD}\` value has been retrieved from.`
                }
            },
            resolve: (sourceNode, args, info) => {
                return this.getOrderByAndPaginationResolver(schemaField,sourceNode,args,info,orderByType)
            }
        };
    }

    augmentQuickSearchSearch(schemaField: QueryNodeField, itemTypes: ReadonlyArray<RootEntityType>): QueryNodeField {
        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [QUICK_SEARCH_EXPRESSION_ARG]: {
                    type: GraphQLString
                }
            },
            resolve: (sourceNode, args, info) => {
                let parentNode = schemaField.resolve(sourceNode, args, info);
                if(parentNode instanceof QuickSearchQueryNode){
                    return new QuickSearchQueryNode({
                        entity: parentNode.entity,
                        isGlobal: parentNode.isGlobal,
                        itemVariable: parentNode.itemVariable
                    }); // @MSF GLOBAL TODO: resolver - generate Global-Search-Search-Filter
                }else{
                    throw new Error("Quicksearch Augment only possible on QuickSearchQueryNodes") // @MSF OPT TODO: proper error
                }
            }
        };
    }

    public getOrderByAndPaginationResolver(schemaField: QueryNodeField, sourceNode:QueryNode, args:{[p: string]: any}, info: QueryNodeResolveInfo, orderByType:SystemFieldOrderByEnumType) {
        let listNode = schemaField.resolve(sourceNode, args, info);
        let itemVariable = new VariableQueryNode(`qsGlobalResult`); // @MSF OPT TODO: constant itemVariable Name



        // if we can, just extend a given TransformListNode so that other cruddl optimizations can operate
        // (e.g. projection indirection)
        let filterNode: QueryNode | undefined;
        const originalListNode = listNode;
        if (listNode instanceof TransformListQueryNode
            && listNode.skip === 0
            && listNode.orderBy.isUnordered()
            && listNode.maxCount == undefined
            && listNode.innerNode === listNode.itemVariable) {
            filterNode = listNode.filterNode.equals(ConstBoolQueryNode.TRUE) ? undefined : listNode.filterNode;
            itemVariable = listNode.itemVariable;
            listNode = listNode.listNode;
        }

        const maxCount: number | undefined = args[FIRST_ARG];
        const skip = args[SKIP_ARG];
        const paginationFilter = this.createPaginationFilterNode(args, itemVariable, orderByType);
        const afterArg = args[AFTER_ARG];
        const isCursorRequested = info.fieldRequestStack[info.fieldRequestStack.length - 1].selectionSet.some(sel => sel.fieldRequest.field.name === CURSOR_FIELD);
        // we only require the absolute ordering for cursor-based pagination, which is detected via a cursor field or the "after" argument.
        const isAbsoluteOrderRequired = isCursorRequested || !!afterArg;
        const orderBy = this.getOrderSpecification(args, orderByType, itemVariable, {isAbsoluteOrderRequired});

        if (orderBy.isUnordered() && maxCount == undefined && paginationFilter === ConstBoolQueryNode.TRUE) {
            return originalListNode;
        }

        // if (!skip && maxCount != undefined && orderBy.clauses.length > 1 && afterArg && type && type.isRootEntityType) {
        //     // optimization that makes use of an index that spans multiple order fields
        //     // see https://github.com/arangodb/arangodb/issues/2357
        //     // TODO only really do this here if there is an index covering this
        //     // (however, it's not that easy - it needs to include the filter stuff that is already baked into
        //     // listNode)
        //     return this.getPaginatedNodeUsingMultiIndexOptimization({
        //         orderBy,
        //         itemVariable,
        //         orderByType,
        //         listNode,
        //         args,
        //         maxCount,
        //         filterNode
        //     });
        // }

        return new TransformListQueryNode({
            listNode,
            itemVariable,
            orderBy,
            skip,
            maxCount,
            filterNode: filterNode && paginationFilter ? and(filterNode, paginationFilter) : (filterNode || paginationFilter)
        });
    }

    private getOrderSpecification(args: any, orderByType: SystemFieldOrderByEnumType, itemNode: QueryNode, options: { readonly isAbsoluteOrderRequired: boolean }) {
        const mappedValues = this.getOrderByValues(args, orderByType, options);
        const clauses = mappedValues.map(value => value.getClause(itemNode));
        return new OrderSpecification(clauses);
    }

    private createPaginationFilterNode(args: any, itemNode: QueryNode, orderByType: SystemFieldOrderByEnumType): QueryNode | undefined {
        const afterArg = args[AFTER_ARG];
        if (!afterArg) {
            return undefined;
        }

        let cursorObj: any;
        try {
            cursorObj = JSON.parse(afterArg);
            if (typeof cursorObj != 'object' || cursorObj === null) {
                return new RuntimeErrorQueryNode('The JSON value provided as "after" argument is not an object');
            }
        } catch (e) {
            return new RuntimeErrorQueryNode(`Invalid cursor ${JSON.stringify(afterArg)} supplied to "after": ${e.message}`);
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
                return new RuntimeErrorQueryNode(`Invalid cursor supplied to "after": Property "${cursorProperty}" missing. Make sure this cursor has been obtained with the same orderBy clause.`);
            }
            const cursorValue = cursorObj[cursorProperty];
            const valueNode = clause.getValueNode(itemNode);

            const operator = clause.direction == OrderDirection.ASCENDING ? BinaryOperator.GREATER_THAN : BinaryOperator.LESS_THAN;
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

        return filterForClause(this.getOrderByValues(args, orderByType, { isAbsoluteOrderRequired: true }));
    }

    private getOrderByValues(args: any, orderByType: SystemFieldOrderByEnumType, { isAbsoluteOrderRequired }: { readonly isAbsoluteOrderRequired: boolean }): ReadonlyArray<OrderByEnumValue> {
        const valueNames = (args[ORDER_BY_ARG] || []) as ReadonlyArray<string>;
        const values = valueNames.map(value => orderByType.getValueOrThrow(value));
        return values;
    }



}

export class SystemFieldOrderByEnumType {
    constructor(public readonly values: ReadonlyArray<OrderByEnumValue>) {

    }

    get name() {
        return "GlobalOrderBy";
        // @MSF OPT TODO: constant
        // @MSF OPT TODO: check for collision
    }


    @memorize()
    private get valueMap(): Map<string, OrderByEnumValue> {
        return new Map(this.values.map((v): [string, OrderByEnumValue] => ([v.name, v])));
    }
    // @MSF OPT TODO: is this needed?
    // getValue(name: string): OrderByEnumValue|undefined {
    //     return this.valueMap.get(name);
    // }

    getValueOrThrow(name: string): OrderByEnumValue {
        const value = this.valueMap.get(name);
        if (!value) {
            throw new Error(`Expected "${this.name}" to have value "${name}"`);
        }
        return value;
    }

    @memorize()
    getEnumType(): GraphQLEnumType {
        return new GraphQLEnumType({
            name: this.name,
            values: chain(this.values)
                .keyBy(value => value.name)
                .mapValues(value => ({value: value.name}))
                .value()
        });
    }
}