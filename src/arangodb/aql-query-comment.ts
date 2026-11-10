/**
 * Gets the comment that is prepended to each AQL query of a transaction
 *
 * The comment starts with the transaction ID so the CancellationManager can find the query.
 *
 * If an operation name is given, it is added in a separate comment so slow query logs and
 * the list of running queries show which GraphQL operation a query belongs to.
 */
export function getAQLQueryComment(
    transactionID: string,
    operationName: string | undefined,
): string {
    const idComment = `/*id:${transactionID}*/`;
    if (!operationName) {
        return idComment;
    }
    return `${idComment} /*op:${sanitizeOperationName(operationName)}*/`;
}

/**
 * Replaces all characters that are not allowed in GraphQL names so the name can't end the comment
 */
function sanitizeOperationName(operationName: string): string {
    return operationName.replace(/[^_0-9A-Za-z]/g, '_');
}
