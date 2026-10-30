/**
 * Parses the numeric ID from an ArangoDB index ID string.
 * Expected format: "collectionName/numericId" (e.g., "articles/461261886").
 * Returns the numeric part, or undefined if the format doesn't match.
 */
export function parseIndexNumericId(indexId: string | undefined): number | undefined {
    if (!indexId) {
        return undefined;
    }
    const slashIndex = indexId.indexOf('/');
    if (slashIndex < 0) {
        return undefined;
    }
    const numericPart = indexId.substring(slashIndex + 1);
    const parsed = parseInt(numericPart, 10);
    if (!Number.isFinite(parsed) || parsed.toString() !== numericPart) {
        return undefined;
    }
    return parsed;
}
