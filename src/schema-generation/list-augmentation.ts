import { Type } from '../model';
import { FilterAugmentation } from './filter-augmentation';
import { OrderByAndPaginationAugmentation } from './order-by-and-pagination-augmentation';
import { QueryNodeField } from './query-node-object-type';

/**
 * Augments list fields with filter and pagination features
 */
export class ListAugmentation {
    constructor(
        private readonly filterAugmentation: FilterAugmentation,
        private readonly orderByAugmentation: OrderByAndPaginationAugmentation
    ) {
    }

    augment(schemaField: QueryNodeField, type: Type): QueryNodeField {
        const filtered = this.filterAugmentation.augment(schemaField, type);
        const paged = this.orderByAugmentation.augment(filtered, type);
        return paged;
    }

}
