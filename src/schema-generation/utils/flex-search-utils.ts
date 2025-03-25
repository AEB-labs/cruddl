import { FlexSearchPrimarySortClause } from '../../model/implementation/flex-search';
import { OrderDirection } from '../../model/implementation/order';
import { RootEntityType } from '../../model';
import { OrderByEnumType, OrderByEnumValue } from '../order-by-enum-generator';

export function orderArgMatchesPrimarySort(
    clauses: ReadonlyArray<string> | undefined,
    primarySort: ReadonlyArray<FlexSearchPrimarySortClause>,
): boolean {
    // if no orderBy is given, we will always default to the primarySort order (OrderByAndPaginationAugmentation)
    if (!clauses || !clauses.length) {
        return true;
    }

    if (clauses.length > primarySort.length) {
        return false;
    }

    // note that primary sort cannot be used backwards

    for (let index = 0; index < clauses.length; index++) {
        const arg = clauses[index];
        if (arg.endsWith('_ASC')) {
            const field = arg.substring(0, arg.length - '_ASC'.length);
            if (
                primarySort[index].field.path !== field ||
                primarySort[index].direction !== OrderDirection.ASCENDING
            ) {
                return false;
            }
        } else {
            const field = arg.substring(0, arg.length - '_DESC'.length);
            if (
                primarySort[index].field.path !== field ||
                primarySort[index].direction !== OrderDirection.DESCENDING
            ) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Generates a list of orderBy enum values that exactly represent the primary search
 */
export function getSortClausesForPrimarySort(
    objectType: RootEntityType,
    orderByType: OrderByEnumType,
): ReadonlyArray<OrderByEnumValue> {
    // this would be cleaner if the primary sort was actually parsed into a ModelComponent (see e.g. the Index and IndexField classes)
    return objectType.flexSearchPrimarySort.map((clause) =>
        orderByType.getValueOrThrow(
            clause.field.path.replace('.', '_') +
                (clause.direction === OrderDirection.ASCENDING ? '_ASC' : '_DESC'),
        ),
    );
}
