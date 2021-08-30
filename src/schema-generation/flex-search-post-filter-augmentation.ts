import { RuntimeErrorQueryNode } from '../query-tree';
import { Type } from '../model';
import { FILTER_ARG, POST_FILTER_ARG } from '../schema/constants';
import { FilterTypeGenerator } from './filter-input-types';
import { QueryNodeField } from './query-node-object-type';
import { RootFieldHelper } from './root-field-helper';
import { buildFilteredListNode } from './utils/filtering';

/**
 * Augments list fields with postFilter features
 */
export class FlexSearchPostFilterAugmentation {
    constructor(
        private readonly filterTypeGenerator: FilterTypeGenerator,
        private readonly rootFieldHelper: RootFieldHelper
    ) {}

    augment(schemaField: QueryNodeField, itemType: Type): QueryNodeField {
        if (!itemType.isObjectType) {
            return schemaField;
        }

        const filterType = this.filterTypeGenerator.generate(itemType);

        return {
            ...schemaField,
            args: {
                ...schemaField.args,
                [FILTER_ARG]: {
                    deprecationReason: `Renamed to postFilter. Use postFilter instead.`,
                    type: filterType.getInputType()
                },
                [POST_FILTER_ARG]: {
                    description: `Filters that will be applied in memory after the flexSearchFilter.\n\nThis will not use any indices and will only work if applied on less than 10 000 objects.`,
                    type: filterType.getInputType()
                }
            },
            resolve: (sourceNode, args, info) => {
                const filterValue = args[POST_FILTER_ARG];
                const legacyFilterValue = args[FILTER_ARG];
                if (filterValue && legacyFilterValue) {
                    return new RuntimeErrorQueryNode(
                        `Cannot combine ${FILTER_ARG} and ${POST_FILTER_ARG}. Use only ${POST_FILTER_ARG}.`
                    );
                }

                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode({
                    listNode,
                    filterValue: filterValue || legacyFilterValue,
                    filterType,
                    itemType,
                    objectNodeCallback: itemNode => this.rootFieldHelper.getRealItemNode(itemNode, info)
                });
            }
        };
    }
}
