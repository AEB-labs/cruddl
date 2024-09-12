import { IDENTIFIER_CHAR_PATTERN } from './patterns';

enum ParserState {
    EXPECT_IDENTIFIER,
    PARSING_IDENTIFIER,
    EXPECT_AMPERSAND_OR_END,
}

const EOF = Symbol('EOF');

export interface ParseModuleSpecificationExpressionResult {
    readonly error?: ParseModuleSpecificationExpressionError;
    readonly andCombinedIdentifiers?: ReadonlyArray<ParseModuleSpecificationExpressionResultIdentifier>;
}

export interface ParseModuleSpecificationExpressionError {
    readonly message: string;
    readonly offset: number;
}

export interface ParseModuleSpecificationExpressionResultIdentifier {
    readonly name: string;
    readonly offset: number;
}

export function parseModuleSpecificationExpression(
    expression: string,
): ParseModuleSpecificationExpressionResult {
    let state = ParserState.EXPECT_IDENTIFIER;
    let currentIdentifer = '';
    const andCombinedIdentifiers: ParseModuleSpecificationExpressionResultIdentifier[] = [];
    // <= expression.length so we have one extra iteration for EOF to finish up
    for (let offset = 0; offset <= expression.length; offset++) {
        const char = offset < expression.length ? expression[offset] : EOF;
        const isEOF = char === EOF;
        const isIdentifierChar = char !== EOF && !!char.match(IDENTIFIER_CHAR_PATTERN);
        const isWhitespace = char !== EOF && char.match(/\s/);
        switch (state) {
            case ParserState.EXPECT_IDENTIFIER:
                if (isIdentifierChar) {
                    currentIdentifer = char;
                    state = ParserState.PARSING_IDENTIFIER;
                } else if (isWhitespace) {
                    // do nothing
                } else if (isEOF) {
                    return {
                        error: {
                            offset,
                            message: `Expected identifier.`,
                        },
                    };
                } else {
                    return {
                        error: {
                            offset,
                            message: `Expected identifier, but got "${char}".`,
                        },
                    };
                }
                break;

            case ParserState.PARSING_IDENTIFIER:
                if (isIdentifierChar) {
                    currentIdentifer += char;
                } else {
                    // done parsing identifier
                    andCombinedIdentifiers.push({
                        name: currentIdentifer,
                        offset: offset - currentIdentifer.length,
                    });
                    if (char === '&') {
                        // expecting next module
                        state = ParserState.EXPECT_IDENTIFIER;
                    } else if (isWhitespace) {
                        state = ParserState.EXPECT_AMPERSAND_OR_END;
                    } else if (isEOF) {
                        // do nothing
                    } else {
                        return {
                            error: {
                                offset,
                                message: `Expected identifier or "&", but got "${char}".`,
                            },
                        };
                    }
                }
                break;

            case ParserState.EXPECT_AMPERSAND_OR_END:
                if (char === '&') {
                    // expecting next module
                    state = ParserState.EXPECT_IDENTIFIER;
                } else if (isEOF || isWhitespace) {
                    // do nothing
                } else {
                    return {
                        error: {
                            offset,
                            message: `Expected "&", but got "${char}".`,
                        },
                    };
                }
        }
    }

    return { andCombinedIdentifiers };
}
