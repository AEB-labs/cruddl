/**
 * Finds the candidates that are probably misspellings of the given name (or the other way round)
 *
 * The comparison is case-insensitive. The result is ordered by similarity, most similar first.
 */
export function getSimilarNames(name: string, candidates: Iterable<string>): ReadonlyArray<string> {
    const maxDistance = name.length <= 3 ? 1 : 2;
    const lowerName = name.toLowerCase();
    return [...new Set(candidates)]
        .filter((candidate) => candidate !== name)
        .map((candidate) => ({
            candidate,
            distance: getEditDistance(lowerName, candidate.toLowerCase()),
        }))
        .filter(({ distance }) => distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance)
        .map(({ candidate }) => candidate);
}

/**
 * Levenshtein distance of two strings
 */
function getEditDistance(a: string, b: string): number {
    let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const currentRow = [i];
        for (let j = 1; j <= b.length; j++) {
            currentRow[j] = Math.min(
                previousRow[j] + 1,
                currentRow[j - 1] + 1,
                previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        previousRow = currentRow;
    }
    return previousRow[b.length];
}
