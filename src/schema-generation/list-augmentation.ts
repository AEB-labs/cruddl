import { Type } from '../model/index.js';
import { FilterAugmentation } from './filter-augmentation.js';
import {
    OrderByAndPaginationAugmentation,
    OrderByAndPaginationAugmentationOptions,
} from './order-by-and-pagination-augmentation.js';
import { QueryNodeField } from './query-node-object-type/index.js';

export interface ListAugmentationOptions {
    orderByAugmentationOptions?: OrderByAndPaginationAugmentationOptions;
}

/**
 * Augments list fields with filter and pagination features
 */
export class ListAugmentation {
    constructor(
        private readonly filterAugmentation: FilterAugmentation,
        private readonly orderByAugmentation: OrderByAndPaginationAugmentation,
    ) {}

    augment(
        schemaField: QueryNodeField,
        type: Type,
        options?: ListAugmentationOptions,
    ): QueryNodeField {
        const filtered = this.filterAugmentation.augment(schemaField, type);
        const paged = this.orderByAugmentation.augment(
            filtered,
            type,
            options?.orderByAugmentationOptions,
        );
        return paged;
    }
}
