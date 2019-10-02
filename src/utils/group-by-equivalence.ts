/**
 * Partitions an array into equivalence classes, where the equality relation is defined by a callback
 *
 * The time complexity is O(n*m), where n is the number of items and n is the number of equivalence classes
 */
export function groupByEquivalence<T>(items: ReadonlyArray<T>, equals: (a: T, b: T) => boolean): ReadonlyArray<ReadonlyArray<T>> {
    // credits for the algorithm to https://stackoverflow.com/questions/48177538/is-there-a-subquadratic-algorithm-to-partition-items-into-equivalence-classes
    const groups: T[][] = [];
    for (const item of items) {
        let foundGroup = false;
        for (const group of groups) {
            if (equals(item, group[0])) {
                group.push(item);
                foundGroup = true;
                break;
            }
        }
        if (!foundGroup) {
            groups.push([item]);
        }
    }
    return groups;
}
