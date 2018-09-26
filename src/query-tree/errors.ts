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
    constructor(public readonly message: string) {
        super();
    }

    public describe() {
        return red(`error ${JSON.stringify(this.message)}`);
    }
}

export const RUNTIME_ERROR_TOKEN = '__cruddl_runtime_error';

/**
 * The result value of a RuntimeErrorQueryNode
 */
export interface RuntimeErrorValue {
    /**
     * The error message
     */
    __cruddl_runtime_error: string
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
export function extractRuntimeError(value: RuntimeErrorValue): Error {
    return new Error(value.__cruddl_runtime_error);
}

/**
 * Creates an instance of RuntimeErrorValue
 */
export function createRuntimeErrorValue(message: string): RuntimeErrorValue {
    return {
        [RUNTIME_ERROR_TOKEN]: message
    };
}
