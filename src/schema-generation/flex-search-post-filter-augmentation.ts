import { RuntimeErrorQueryNode } from '../query-tree';
import { Type } from '../model';
import { FILTER_ARG, POST_FILTER_ARG } from '../schema/constants';
import { FilterTypeGenerator } from './filter-input-types';
import { QueryNodeField } from './query-node-object-type';
import { RootFieldHelper } from './root-field-helper';
import { buildFilteredListNode } from './utils/filtering';
import { GraphQLFieldConfigArgumentMap } from 'graphql/index';

export interface FlexSearchPostFilterAugmentationOptions {
    /**
     * Set to true to remove the "filter" argument from flexSearch filter fields (this is deprecated
     * in favor of "postFilter" and will be removed in the future)
     */
    omitDeprecatedOldPostFilterVariant?: boolean;
}

/**
 * Augments list fields with postFilter features
 */
export class FlexSearchPostFilterAugmentation {
    constructor(
        private readonly filterTypeGenerator: FilterTypeGenerator,
        private readonly rootFieldHelper: RootFieldHelper,
        private readonly options: FlexSearchPostFilterAugmentationOptions,
    ) {}

    augment(schemaField: QueryNodeField, itemType: Type): QueryNodeField {
        if (!itemType.isObjectType) {
            return schemaField;
        }

        const filterType = this.filterTypeGenerator.generate(itemType);

        let args: GraphQLFieldConfigArgumentMap = {
            ...schemaField.args,
            [POST_FILTER_ARG]: {
                description: `Filters that will be applied in memory after the flexSearchFilter.\n\nThis will not use any indices and will only work if applied on less than 10 000 objects.`,
                type: filterType.getInputType(),
            },
        };

        if (!this.options.omitDeprecatedOldPostFilterVariant) {
            args = {
                ...args,
                [FILTER_ARG]: {
                    description: `Renamed to postFilter. Use postFilter instead.`,
                    type: filterType.getInputType(),
                },
            };
        }

        return {
            ...schemaField,
            args,
            resolve: (sourceNode, args, info) => {
                const filterValue = args[POST_FILTER_ARG];
                const legacyFilterValue = args[FILTER_ARG];
                if (filterValue && legacyFilterValue) {
                    return new RuntimeErrorQueryNode(
                        `Cannot combine ${FILTER_ARG} and ${POST_FILTER_ARG}. Use only ${POST_FILTER_ARG}.`,
                    );
                }

                let listNode = schemaField.resolve(sourceNode, args, info);
                return buildFilteredListNode({
                    listNode,
                    filterValue: filterValue || legacyFilterValue,
                    filterType,
                    itemType,
                    objectNodeCallback: (itemNode) =>
                        this.rootFieldHelper.getRealItemNode(itemNode, info),
                });
            },
        };
    }
}
