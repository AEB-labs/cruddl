import {QueryNodeField} from "./query-node-object-type";
import {RootEntityType, Type} from "../model/implementation";
import {QUICK_SEARCH_FILTER_ARG} from "../schema/constants";
import {QuickSearchFilterTypeGenerator} from "./quick-search-filter-input-types/generator";
import {buildFilteredListNode} from "./utils/filtering";

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
                }
            },
            resolve: (sourceNode, args, info) => {
                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode(listNode, args, quickSearchType, itemType); // @MSF TODO: resolver
            }
        };
    };

}
