import { escapeRegExp } from '../utils/utils';

/**
 * Gets the literal part until the first placeholder. Also returns whether the literal part is followed by a simple %
 * placeholder
 * @param pattern a LIKE pattern with % and _ as placeholders (escaped with \)
 */
export function analyzeLikePatternPrefix(pattern: string): { literalPrefix: string, isSimplePrefixPattern: boolean } {
    // pattern: % and _ are placeholders, can be escaped with backslash
    let literalPrefix = '';
    let i = 0;
    while (i < pattern.length) {
        const char = pattern[i];
        switch (char) {
            case '\\':
                const nextChar = pattern[i + 1];
                if (nextChar === '%' || nextChar === '_' || nextChar === '\\') {
                    literalPrefix += nextChar;
                    i += 2;
                } else {
                    // might be trailing backslash or an unescaped backslash, (e.g. \\a will be interpreted like
                    // \\\\a) - to stay consistent with ArangoDB
                    literalPrefix += char;
                    i++;
                }
                break;
            case '%':
                // normally, for simple prefixes ending in %, the remainder would be empty - but in case there are
                // multiple % placeholders, this is equivalent.
                const remainder = pattern.substr(i + 1);
                const isSimplePrefixPattern = Array.from(remainder).every(c => c === '%');
                return { literalPrefix, isSimplePrefixPattern };
            case '_':
                return { literalPrefix, isSimplePrefixPattern: false };
            default:
                literalPrefix += pattern[i];
                i++;
                break;
        }
    }
    return { literalPrefix, isSimplePrefixPattern: false };
}

export function likePatternToRegExp(pattern: string): RegExp {
    let regex = '';
    let i = 0;
    while (i < pattern.length) {
        const char = pattern[i];
        switch (char) {
            case '\\':
                const nextChar = pattern[i + 1];
                if (nextChar === '%' || nextChar === '_' || pattern[ + 1] === '\\') {
                    regex += escapeRegExp(nextChar);
                    i += 2;
                } else {
                    // might be trailing backslash or an unescaped backslash, (e.g. \\a will be interpreted like
                    // \\\\a) - to stay consistent with ArangoDB
                    regex += escapeRegExp(char);
                    i++;
                }
                break;
            case '%':
                // no dotall modifier for now in JavaScript (there is a proposal for it though)
                regex += '([\\s\\S]*)';
                i++;
                break;
            case '_':
                regex += '[\\s\\S]';
                i++;
                break;
            default:
                regex += escapeRegExp(char);
                i++;
                break;
        }
    }
    return RegExp('^' + regex + '$', 'i'); // i: case insensitive
}
