export interface QueryResultValidatorFunctionProvider {
    getValidatorName(): string;
    getValidatorFunction(): (validationData: any, result:any) => void;
}

export interface QueryResultValidator {
    getValidatorName(): string;
    getValidatorData(): any
    describe():string
}

export class ErrorIfNotTruthyResultValidator implements QueryResultValidator {
    constructor (public readonly errorMessage: string, public readonly errorName: string = 'Error', public readonly errorNumber?: number) {
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction(){
        return function(validationData: any, result: any) {
            if(!result) {
                let err = new Error(validationData.errorMessage);
                // the name is included in the error message (and can't bet set to '', neither is toString() called)
                err.name = validationData.errorName;
                if(validationData.errorNumber != undefined) {
                    (err as any).errorNumber = validationData.errorNumber;
                }
                throw err;
            }
        }
    }

    static getValidatorName(){
        return "ErrorIfNotTruthy";
    }
    getValidatorName(){
        return ErrorIfNotTruthyResultValidator.getValidatorName();
    }

    getValidatorData(){
        return {
            errorMessage: this.errorMessage,
            errorNumber: this.errorNumber,
            errorName: this.errorName
        };
    }

    describe(){
        return "not truthy => error";
    }
}

export class ErrorIfEmptyResultValidator implements QueryResultValidator {
    constructor (public readonly errorMessage: string, public readonly errorName: string = 'Error', public readonly errorNumber?: number) {
    }

    // The following function will be translated to a string and executed within the ArangoDB server itself.
    // Therefore the next comment is necessary to instruct our test coverage tool (https://github.com/istanbuljs/nyc)
    // not to instrument the code with coverage instructions.

    /* istanbul ignore next */
    static getValidatorFunction(){
        return function(validationData: any, result: any) {
            if(!result || !result.length) {
                let err = new Error(validationData.errorMessage);
                // the name is included in the error message (and can't bet set to '', neither is toString() called)
                err.name = validationData.errorName;
                if(validationData.errorNumber != undefined) {
                    (err as any).errorNumber = validationData.errorNumber;
                }
                throw err;
            }
        }
    }

    static getValidatorName(){
        return "ErrorIfEmpty";
    }
    getValidatorName(){
        return ErrorIfEmptyResultValidator.getValidatorName();
    }

    getValidatorData(){
        return {
            errorMessage: this.errorMessage,
            errorNumber: this.errorNumber,
            errorName: this.errorName
        };
    }

    describe(){
        return "if empty => error";
    }
}

export const ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS: QueryResultValidatorFunctionProvider[] = [
    ErrorIfNotTruthyResultValidator,
    ErrorIfEmptyResultValidator
]