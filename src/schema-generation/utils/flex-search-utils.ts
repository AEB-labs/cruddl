import { FlexSearchPrimarySortConfig } from '../../database/arangodb/schema-migration/arango-search-helpers';

export function orderArgMatchesPrimarySort(
    clauses: ReadonlyArray<string> | undefined,
    primarySort: ReadonlyArray<FlexSearchPrimarySortConfig>
): boolean {
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
            if (primarySort[index].field !== field || !primarySort[index].asc) {
                return false;
            }
        } else {
            const field = arg.substring(0, arg.length - '_DESC'.length);
            if (primarySort[index].field !== field || primarySort[index].asc) {
                return false;
            }
        }
    }

    return true;
}
