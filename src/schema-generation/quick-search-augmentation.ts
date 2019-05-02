import {QueryNodeField} from "./query-node-object-type";
import {ObjectType, RootEntityType, Type} from "../model/implementation";
import {
    AFTER_ARG,
    CURSOR_FIELD,
    FILTER_ARG, FIRST_ARG,
    ID_FIELD,
    ORDER_BY_ARG, ORDER_BY_ASC_SUFFIX, QUICK_SEARCH_EXPRESSION_ARG,
    QUICK_SEARCH_FILTER_ARG, SKIP_ARG
} from "../schema/constants";
import {QuickSearchFilterTypeGenerator} from "./quick-search-filter-input-types/generator";
import {buildFilteredListNode} from "./utils/filtering";
import {OrderByEnumGenerator, OrderByEnumValue} from "./order-by-enum-generator";
import {GraphQLEnumType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString} from "graphql";
import {ConstBoolQueryNode, QueryNode, TransformListQueryNode, VariableQueryNode} from "../query-tree";
import {decapitalize} from "../utils/utils";
import {and} from "./filter-input-types/constants";
import {getOrderByTypeName} from "../schema/names";
import { chain } from 'lodash';
import memorize from "memorize-decorator";


/**
 * Augments list fields with filter and pagination features
 */
export class QuickSearchAugmentation {
    constructor(private readonly quickSearchTypeGenerator: QuickSearchFilterTypeGenerator) {

    }

    augment(schemaField: QueryNodeField, itemType: RootEntityType): QueryNodeField {
        if (!itemType.isObjectType) {
            return schemaField;
        }
        const quickSearchFilterable = this.augmentQuickSearchFilter(schemaField, itemType)
        if(itemType.fields.some(value => value.isSearchable)){
            const quickSearchSearchable = this.augmentQuickSearchSearch(schemaField)
            return quickSearchSearchable;
        }else{
            return quickSearchFilterable;
        }



    };

    augmentQuickSearchFilter(schemaField: QueryNodeField, itemType: RootEntityType): QueryNodeField {
        const quickSearchType = this.quickSearchTypeGenerator.generate(itemType);
        // @MSF TODO Add Search Field
        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [QUICK_SEARCH_FILTER_ARG]: {
                    type: quickSearchType.getInputType()
                }
            },
            resolve: (sourceNode, args, info) => {
                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode(listNode, args, quickSearchType, itemType); // @MSF TODO: resolver
            }
        };
    }

    augmentQuickSearchSearch(schemaField: QueryNodeField): QueryNodeField {
        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [QUICK_SEARCH_EXPRESSION_ARG]: {
                    type: GraphQLString
                }
            },
            resolve: (sourceNode, args, info) => {
                return sourceNode; // @MSF TODO: resolver
            }
        };
    }

    augmentGlobal(schemaField: QueryNodeField, itemTypes: ReadonlyArray<RootEntityType>): QueryNodeField {
        const quickSearchFilterable = this.augmentGlobalQuickSearch(schemaField,itemTypes);
        const paged = this.augmentGlobalPaged(quickSearchFilterable,itemTypes);
        if(itemTypes.some(value => value.fields.some(value1 => value1.isSearchable))){
            const quickSearchable = this.augmentQuickSearchSearch(paged);
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
                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode(listNode, args, quickSearchType, itemTypes[0]); // @MSF TODO: resolver
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
                    description: `orderby` // @MSF TODO: description
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
                return sourceNode // @MSF TODO: resolver
            }
        };
    }
}

export class SystemFieldOrderByEnumType {
    constructor(public readonly values: ReadonlyArray<OrderByEnumValue>) {

    }

    get name() {
        return "GlobalOrderBy";
        // @MSF TODO: constant
        // @MSF TODO: check for collision
    }

    // @MSF TODO: is this needed?
    // @memorize()
    // private get valueMap(): Map<string, OrderByEnumValue> {
    //     return new Map(this.values.map((v): [string, OrderByEnumValue] => ([v.name, v])));
    // }
    //
    // getValue(name: string): OrderByEnumValue|undefined {
    //     return this.valueMap.get(name);
    // }
    //
    // getValueOrThrow(name: string): OrderByEnumValue {
    //     const value = this.valueMap.get(name);
    //     if (!value) {
    //         throw new Error(`Expected "${this.name}" to have value "${name}"`);
    //     }
    //     return value;
    // }

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
