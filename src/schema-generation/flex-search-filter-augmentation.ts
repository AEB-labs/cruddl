import { Type } from '../model';
import { FILTER_ARG, POST_FILTER_ARG } from '../schema/constants';
import { FilterTypeGenerator } from './filter-input-types';
import { QueryNodeField } from './query-node-object-type';
import { RootFieldHelper } from './root-field-helper';
import { buildFilteredListNode } from './utils/filtering';

/**
 * Augments list fields with filter features
 */
export class FlexSearchFilterAugmentation {
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
                    description: `hello there`,
                    deprecationReason: `Renamed to postFilter. Use postFilter instead.`,
                    type: filterType.getInputType()
                },
                [POST_FILTER_ARG]: {
                    type: filterType.getInputType()
                }
            },
            resolve: (sourceNode, args, info) => {
                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode({
                    listNode,
                    args,
                    filterValue: args[POST_FILTER_ARG],
                    filterType,
                    itemType,
                    objectNodeCallback: itemNode => this.rootFieldHelper.getRealItemNode(itemNode, info)
                });
            }
        };
    }
}
