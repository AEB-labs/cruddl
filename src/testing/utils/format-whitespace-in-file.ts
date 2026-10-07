/**
 * Normalizes the whitespace of a file that is written and compared by tests
 */
export function formatWhitespaceInFile(s: string) {
    if (!s.endsWith('\n')) {
        s += '\n';
    }

    // remove trailing whitespace in lines
    // (editors remove that, so it's hard to keep it in expected files)
    s = s
        .split('\n')
        .map((line) => line.replace(/\s+$/g, ''))
        .join('\n');
    return s;
}
