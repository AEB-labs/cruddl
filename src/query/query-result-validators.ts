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
    constructor (public readonly errorMessage: string, public readonly errorNumber?: number) {
    }

    static getValidatorFunction(){
        return function(validationData: any, result: any) {
            if(!result) {
                let err = new Error(validationData.errorMessage);
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
            errorNumber: this.errorNumber
        };
    }

    describe(){
        return "not truthy => error";
    }
}

export const ALL_QUERY_RESULT_VALIDATOR_FUNCTION_PROVIDERS: QueryResultValidatorFunctionProvider[] = [
    ErrorIfNotTruthyResultValidator
]