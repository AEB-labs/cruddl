import { Type } from '../model';
import { FILTER_ARG } from '../schema/schema-defaults';
import { FilterTypeGenerator } from './filter-input-types';
import { QueryNodeField } from './query-node-object-type';
import { buildFilteredListNode } from './utils/filtering';

/**
 * Augments list fields with filter features
 */
export class FilterAugmentation {
    constructor(
        private readonly filterTypeGenerator: FilterTypeGenerator
    ) {
    }

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
                    type: filterType.getInputType()
                }
            },
            resolve: (sourceNode, args) => {
                let listNode = schemaField.resolve(sourceNode, args);
                return buildFilteredListNode(listNode, args, filterType, itemType);
            }
        };
    };

}
