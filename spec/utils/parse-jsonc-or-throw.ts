import { parse as parseJSONC, printParseErrorCode, type ParseError } from 'jsonc-parser';

export function parseJSONCOrThrow<T>(source: string, sourcePath: string): T {
    const parseErrors: ParseError[] = [];
    const parsed = parseJSONC(source, parseErrors, {
        allowTrailingComma: false,
        disallowComments: false,
    });

    if (parseErrors.length) {
        const firstError = parseErrors[0];
        throw new Error(
            `Invalid JSONC in ${sourcePath} at offset ${firstError.offset}: ${printParseErrorCode(firstError.error)}`,
        );
    }

    return parsed as T;
}
