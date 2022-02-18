import { FlexSearchPrimarySortClause } from '../../model/implementation/flex-search';
import { OrderDirection } from '../../model/implementation/order';

export function orderArgMatchesPrimarySort(
    clauses: ReadonlyArray<string> | undefined,
    primarySort: ReadonlyArray<FlexSearchPrimarySortClause>
): boolean {
    // TODO what about sort clauses that are added automatically because the user used cursor-based pagination?
    if (!clauses || !clauses.length) {
        return true;
    }

    if (clauses.length > primarySort.length) {
        return false;
    }

    for (let index = 0; index < clauses.length; index++) {
        const arg = clauses[index];
        if (arg.endsWith('_ASC')) {
            const field = arg.substring(0, arg.length - '_ASC'.length);
            if (primarySort[index].field.path !== field || primarySort[index].direction !== OrderDirection.ASCENDING) {
                return false;
            }
        } else {
            const field = arg.substring(0, arg.length - '_DESC'.length);
            if (primarySort[index].field.path !== field || primarySort[index].direction !== OrderDirection.DESCENDING) {
                return false;
            }
        }
    }

    return true;
}
