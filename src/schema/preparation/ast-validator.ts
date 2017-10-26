import {DocumentNode} from "graphql";
import {Severity, ValidationMessage} from "./validation-message";
import {flatMap} from "../../utils/utils";
import {NoDuplicateTypesValidator} from "./ast-validation-modules/no-duplicate-types-validator";
import {OnlyAllowedTypesValidator} from "./ast-validation-modules/only-allowed-types-validator";
import {KeyFieldValidator} from "./ast-validation-modules/key-field-validator";
import {EntityDirectiveNestingValidator} from "./ast-validation-modules/entity-directive-nesting-validator";
import {NoListOfReferencesValidator} from "./ast-validation-modules/no-list-of-references-validator";
import {RelationsOnlyInRootEntitiesValidator} from "./ast-validation-modules/relations-only-in-root-entities-validator";
import {RelationsOnlyToRootEntitiesValidator} from "./ast-validation-modules/relations-only-to-root-entities-validator";
import {ReferenceOnlyToRootEntitiesWithKeyFieldValidator} from "./ast-validation-modules/references-only-to-root-entities-with-key-field-validator";

const validators = [
    NoDuplicateTypesValidator,
    OnlyAllowedTypesValidator,
    KeyFieldValidator,
    EntityDirectiveNestingValidator,
    NoListOfReferencesValidator,
    RelationsOnlyInRootEntitiesValidator,
    RelationsOnlyToRootEntitiesValidator,
    ReferenceOnlyToRootEntitiesWithKeyFieldValidator
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