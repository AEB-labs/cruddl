import { red } from '../utils/colors';
import { QueryNode } from './base';

/**
 * A node which can never evaluate to any value and thus prevents a query from being executed
 */
export class UnknownValueQueryNode extends QueryNode {
    public describe() {
        return `unknown`;
    }
}

/**
 * A node that evaluates to an error value (as defined by RuntimeErrorValue) but does not prevent the rest from the
 * query tree from being evaluated
 */
export class RuntimeErrorQueryNode extends QueryNode {
    readonly code: string | undefined;

    constructor(readonly message: string, args: { readonly code?: string } = {}) {
        super();
        this.code = args.code;
    }

    public describe() {
        return red(`error${this.code ? ' ' + this.code : ''} ${JSON.stringify(this.message)}`);
    }
}

export const PERMISSION_DENIED_ERROR = 'PERMISSION_DENIED';
export const ATOMICITY_SKIP_ERROR = 'ATOMICITY_SKIP';
export const INVALID_CURSOR_ERROR = 'INVALID_CURSOR';
export const NOT_FOUND_ERROR = 'NOT_FOUND';
export const FLEX_SEARCH_TOO_MANY_OBJECTS = 'FLEX_SEARCH_TOO_MANY_OBJECTS';
export const BILLING_KEY_FIELD_NOT_FILLED_ERROR = 'BILLING_KEY_FIELD_NOT_FILLED';
export const NOT_SUPPORTED_ERROR = 'NOT_SUPPORTED';

export const RUNTIME_ERROR_TOKEN = '__cruddl_runtime_error';
export const RUNTIME_ERROR_CODE_PROPERTY = '__cruddl_runtime_error_code';

/**
 * The result value of a RuntimeErrorQueryNode
 */
export interface RuntimeErrorValue {
    /**
     * The error message
     */
    readonly __cruddl_runtime_error: string;

    readonly __cruddl_runtime_error_code?: string;
}

/**
 * Determines if a value is the result of a RuntimeErrorQueryNode
 */
export function isRuntimeErrorValue(value: any): value is RuntimeErrorValue {
    return typeof value == 'object' && value !== null && RUNTIME_ERROR_TOKEN in value;
}

/**
 * Converts a RuntimeErrorValue to a regular error that can be thrown
 */
export function extractRuntimeError(value: RuntimeErrorValue): RuntimeError {
    return new RuntimeError(value.__cruddl_runtime_error, { code: value.__cruddl_runtime_error_code });
}

/**
 * An error that can be thrown for part of the GraphQL result
 */
export class RuntimeError extends Error {
    readonly code: string | undefined;

    constructor(message: string, args: { readonly code?: string } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = args.code;
    }
}

/**
 * Creates an instance of RuntimeErrorValue
 */
export function createRuntimeErrorValue(message: string): RuntimeErrorValue {
    return {
        [RUNTIME_ERROR_TOKEN]: message
    };
}
