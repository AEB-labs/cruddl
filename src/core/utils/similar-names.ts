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

const MAX_SUGGESTIONS = 5;

/**
 * Formats a hint like graphql-js does, e.g. ' Did you mean "a", "b", or "c"?'
 *
 * @returns the hint (with a leading space), or an empty string if there are no suggestions
 */
export function didYouMean(suggestions: ReadonlyArray<string>): string {
    const quoted = suggestions.slice(0, MAX_SUGGESTIONS).map((s) => `"${s}"`);
    switch (quoted.length) {
        case 0:
            return '';
        case 1:
            return ` Did you mean ${quoted[0]}?`;
        case 2:
            return ` Did you mean ${quoted[0]} or ${quoted[1]}?`;
        default:
            return ` Did you mean ${quoted.slice(0, -1).join(', ')}, or ${quoted[quoted.length - 1]}?`;
    }
}
