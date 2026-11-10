import { PERMISSION_DENIED_ERROR, RuntimeErrorQueryNode } from '../query-tree/errors.js';
import type { AccessOperation } from './auth-basics.js';

/**
 * Identifies the operation of a PERMISSION_DENIED error
 *
 * Use describeAccessCondition() with the same auth context to find out which permissions apply
 * to the user.
 */
export interface PermissionDenial {
    readonly operation: `${AccessOperation}`;

    /**
     * The name of the root entity type (for denials on objects) or of the declaring type (for
     * denials on fields)
     */
    readonly typeName: string;

    /**
     * The field name, for denials on fields
     */
    readonly fieldName?: string;
}

/**
 * Gets the operation that has been denied if the given error is a PERMISSION_DENIED error
 *
 * Works with errors that are reported for parts of the result (e.g. when reading a type or a
 * field is denied) and with errors that abort a mutation (e.g. when an object to be updated does
 * not match the user's permissions), including GraphQL errors that wrap them.
 */
export function getPermissionDenial(error: unknown): PermissionDenial | undefined {
    let current: unknown = error;
    // GraphQLError.originalError, TransactionError.cause
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
        const denial = (current as { permissionDenial?: unknown }).permissionDenial;
        if (denial && typeof denial === 'object') {
            return denial as PermissionDenial;
        }
        current =
            (current as { originalError?: unknown }).originalError ??
            (current as { cause?: unknown }).cause;
    }
    return undefined;
}

export interface CreatePermissionDeniedNodeParams {
    readonly operation: AccessOperation;
    readonly typeName: string;
    readonly fieldName?: string;

    /**
     * The message for the user, e.g. "Not authorized to read File objects"
     */
    readonly message: string;
}

/**
 * Creates a PERMISSION_DENIED error node for an operation that is denied regardless of the objects
 */
export function createPermissionDeniedNode({
    operation,
    typeName,
    fieldName,
    message,
}: CreatePermissionDeniedNodeParams): RuntimeErrorQueryNode {
    return new RuntimeErrorQueryNode(message, {
        code: PERMISSION_DENIED_ERROR,
        permissionDenial: { operation, typeName, ...(fieldName ? { fieldName } : {}) },
    });
}
