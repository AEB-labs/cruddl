import type { Type } from '../model/index.js';
import { FILTER_ARG } from '../schema/constants.js';
import type { FilterTypeGenerator } from './filter-input-types/index.js';
import type { QueryNodeField } from './query-node-object-type/index.js';
import type { RootFieldHelper } from './root-field-helper.js';
import { buildFilteredListNode } from './utils/filtering.js';

/**
 * Augments list fields with filter features
 */
export class FilterAugmentation {
    constructor(
        private readonly filterTypeGenerator: FilterTypeGenerator,
        private readonly rootFieldHelper: RootFieldHelper,
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
                    type: filterType.getInputType(),
                },
            },
            resolve: (sourceNode, args, info) => {
                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode({
                    listNode,
                    filterValue: args[FILTER_ARG],
                    filterType,
                    itemType,
                });
            },
        };
    }
}
