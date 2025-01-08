import { ArangoError } from 'arangojs/error';
import { RuntimeValidationError } from '../../query-tree/validation';

/**
 * An error that is thrown if a validator fails
 */
export class ArangoQueryError extends Error {
    readonly code: string | undefined;

    readonly isCruddlRuntimeValidationError: true = true;

    constructor(message: string, args: { readonly code?: string } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = args.code;
    }
}

/**
 * Takes a deserialized error (a plain JSON value) and converts it to a real Error instance
 */
export function convertSerializedError(
    error: unknown,
    {
        hasTimedOut,
        wasCancelled,
        transactionTimeoutMs,
    }: {
        hasTimedOut: boolean;
        wasCancelled: boolean;
        transactionTimeoutMs: number | undefined;
    },
): Error {
    if (isSerializedRuntimeValidationError(error)) {
        return new RuntimeValidationError(error.message, {
            code: error.code,
        });
    }

    if (isSerializedArangoError(error)) {
        // some errors need to be translated because we only can differentiate with the context here
        if (error.errorNum === ERROR_QUERY_KILLED) {
            // only check these flags if a QUERY_KILLED error is thrown because we might have initiated a query
            // kill due to timeout / cancellation, but it might have completed or errored for some other reason
            // before the kill is executed
            if (hasTimedOut) {
                return new TransactionTimeoutError({ timeoutMs: transactionTimeoutMs });
            } else if (wasCancelled) {
                return new TransactionCancelledError();
            }
        }

        return new ArangoError();
    }

    // the arango errors are weird and have their message in "errorMessage"...
    return new TransactionError(error.errorMessage || error.message, error);
}

interface SerializedArangoError {
    readonly errorNum?: number;
    readonly errorMessage?: string;
}
function isSerializedArangoError(error: unknown): error is SerializedArangoError {
    return !!error && typeof error === 'object' && 'errorNum' in error;
}

interface SerializedRuntimeValidationError {
    readonly message: string;
    readonly code?: string;
}

function isSerializedRuntimeValidationError(
    error: unknown,
): error is SerializedRuntimeValidationError {
    return (
        !!error &&
        typeof error === 'object' &&
        'isCruddlRuntimeValidationError' in error &&
        !!error.isCruddlRuntimeValidationError
    );
}
