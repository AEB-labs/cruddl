import { QueryNode } from './base';

export interface QueryResultValidatorFunctionProvider {
    /**
     * Gets a unique name for this validator function
     * @returns {string}
     */
    getValidatorName(): string;

    /**
     * Gets the validation function
     *
     * The may be serialized and transported to a different JavaScript engine, so it should work stand-alone and not
     * rely on any libraries.
     *
     * The actual arguments for the function are the result of getValidatorData() and the value of the result variable.
     */
    getValidatorFunction(): (validationData: any, result: any) => void;
}

/**
 * Specifies how a value should be validated
 *
 * This can be used in a PreExecQueryNode. It will be evaluated on its result variable. If the validator reports an
 * error, the whole transaction is cancelled.
 */
export interface QueryResultValidator extends QueryNode {
    /**
     * The name of the validator function (QueryResultValidatorFunctionProvider), which should be present in
     * ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS
     */
    getValidatorName(): string;

    /**
     * Optional data to be passed to the validator function
     */
    getValidatorData(): any
}

/**
 * A validator that verifies that a value is truthy
 */
export class ErrorIfNotTruthyResultValidator extends QueryNode implements QueryResultValidator {
    constructor(public readonly errorMessage: string, public readonly errorName: string = 'Error', public readonly errorNumber?: number) {
        super();
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction() {
        return function (validationData: any, result: any) {
            if (!result) {
                let err = new Error(validationData.errorMessage);
                // the name is included in the error message (and can't bet set to '', neither is toString() called)
                err.name = validationData.errorName;
                if (validationData.errorNumber != undefined) {
                    (err as any).errorNumber = validationData.errorNumber;
                }
                throw err;
            }
        };
    }

    static getValidatorName() {
        return 'ErrorIfNotTruthy';
    }

    getValidatorName() {
        return ErrorIfNotTruthyResultValidator.getValidatorName();
    }

    getValidatorData() {
        return {
            errorMessage: this.errorMessage,
            errorNumber: this.errorNumber,
            errorName: this.errorName
        };
    }

    describe() {
        return 'not truthy => error';
    }
}

/**
 * A validator that verifies that a value is neither falsy nor empty (works for both strings and lists)
 */
export class ErrorIfEmptyResultValidator extends QueryNode implements QueryResultValidator {
    constructor(public readonly errorMessage: string, public readonly errorName: string = 'Error', public readonly errorNumber?: number) {
        super();
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction() {
        return function (validationData: any, result: any) {
            if (!result || !result.length) {
                let err = new Error(validationData.errorMessage);
                // the name is included in the error message (and can't bet set to '', neither is toString() called)
                err.name = validationData.errorName;
                if (validationData.errorNumber != undefined) {
                    (err as any).errorNumber = validationData.errorNumber;
                }
                throw err;
            }
        };
    }

    static getValidatorName() {
        return 'ErrorIfEmpty';
    }

    getValidatorName() {
        return ErrorIfEmptyResultValidator.getValidatorName();
    }

    getValidatorData() {
        return {
            errorMessage: this.errorMessage,
            errorNumber: this.errorNumber,
            errorName: this.errorName
        };
    }

    describe() {
        return 'if empty => error';
    }
}

export const ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS: ReadonlyArray<QueryResultValidatorFunctionProvider> = [
    ErrorIfNotTruthyResultValidator,
    ErrorIfEmptyResultValidator
];
