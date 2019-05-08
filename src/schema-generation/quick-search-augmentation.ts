import {QueryNodeField} from "./query-node-object-type";
import {RootEntityType, Type} from "../model/implementation";
import {QUICK_SEARCH_EXPRESSION_ARG, QUICK_SEARCH_FILTER_ARG} from "../schema/constants";
import {QuickSearchFilterObjectType, QuickSearchFilterTypeGenerator} from "./quick-search-filter-input-types/generator";
import {GraphQLString} from "graphql";
import {
    BinaryOperationQueryNode,
    BinaryOperator,
    ConstBoolQueryNode,
    QueryNode,
    VariableQueryNode
} from "../query-tree";
import {decapitalize} from "../utils/utils";
import {QuickSearchQueryNode} from "../query-tree/quick-search";
import {simplifyBooleans} from "../query-tree/utils";


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
        const quickSearchType = this.quickSearchTypeGenerator.generate(itemType);
        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [QUICK_SEARCH_FILTER_ARG]: {
                    type: quickSearchType.getInputType()
                },
                [QUICK_SEARCH_EXPRESSION_ARG]: {
                    type: GraphQLString
                }
            },
            resolve: (sourceNode, args, info) => {
                let parentNode = schemaField.resolve(sourceNode, args, info);
                if(parentNode instanceof QuickSearchQueryNode){
                    const itemVariable = new VariableQueryNode(decapitalize(itemType.name));
                    const qsFilterNode = this.buildQuickSearchFilterNode(parentNode,args,quickSearchType,itemType, itemVariable);
                    return new QuickSearchQueryNode({
                        entity: parentNode.entity,
                        isGlobal: parentNode.isGlobal,
                        qsFilterNode: qsFilterNode,
                        itemVariable: itemVariable
                    });
                }else{
                    throw new Error("Quicksearch Augment only possible on QuickSearchQueryNodes") // @MSF OPT TODO: proper error
                }

            }
        };


    };

    private buildQuickSearchFilterNode(listNode: QueryNode, args: { [p: string]: any }, filterType: QuickSearchFilterObjectType, itemType: Type, itemVariable: VariableQueryNode) {
        const filterValue = args[QUICK_SEARCH_FILTER_ARG] || {};
        const expression = <string>args[QUICK_SEARCH_EXPRESSION_ARG];
        // @MSF OPT TODO: Type check?
        const filterNode = simplifyBooleans(filterType.getFilterNode(itemVariable, filterValue));
        const searchFilterNode = simplifyBooleans(filterType.getSearchFilterNode(itemVariable,expression))
        if(searchFilterNode === ConstBoolQueryNode.FALSE){
            return filterNode;
        }else{
            return simplifyBooleans(new BinaryOperationQueryNode(filterNode,BinaryOperator.AND,searchFilterNode));
        }

    }
}

