import { ASTNode, DocumentNode, print, TypeDefinitionNode } from 'graphql';

/**
 * Prints a GraphQL document and formats it using four spaces instead of two
 *
 * Might also add line breaks in the future
 *
 * Mostly relevant for documents or type definition nodes. For e.g. a StringValue, print() can be
 * used directly.
 */
export function prettyPrint(node: ASTNode): string {
    // not using prettier at the moment because it's async and it would add it as a dependency
    const printed = print(node);
    return printed.replace(/^((  )+)/gm, '$1$1');
}
