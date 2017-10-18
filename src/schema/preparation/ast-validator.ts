import {DocumentNode, Location} from "graphql";
import {Severity, ValidationMessage} from "./validation-message";
import {flatMap} from "../../utils/utils";
import {NoDuplicateTypesValidator} from "./ast-validation-modules/no-duplicate-types-validator";

const validators = [
    NoDuplicateTypesValidator
];

export interface ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[];
}

export function validateModel(ast: DocumentNode): ValidationResult {
    return new ValidationResult(flatMap(validators, Validator => new Validator().validate(ast)));
}
export class ValidationResult {

    constructor(public readonly messages: ValidationMessage[]) {
    }

    public hasErrors() {
        return this.messages.some(message => message.severity === Severity.Error)
    }

    public hasWarnings() {
        return this.messages.some(message => message.severity === Severity.Warning)
    }

    public hasInfos() {
        return this.messages.some(message => message.severity === Severity.Info)
    }
}