import { GraphQLError, Lexer, TokenKind } from 'graphql/index';
import { Source } from 'graphql';

/**
 * Checks if the given graphql source string only contains comments and whitespace
 * @param source
 */
export function isCommentOnlySource(source: string) {
    const lexer = new Lexer(new Source(source));
    try {
        // lookahead() gets the first non-comment token
        const firstToken = lexer.lookahead();
        return firstToken.kind === TokenKind.EOF;
    } catch (e) {
        if (e instanceof GraphQLError) {
            // syntax error means there is something
            return false;
        }
        throw e;
    }
}
