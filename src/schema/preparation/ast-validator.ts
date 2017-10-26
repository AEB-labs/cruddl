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
import {NoUnusedNonRootObjectTypesValidator} from "./ast-validation-modules/no-unused-non-root-object-types-validator";
import {NoEmptyObjectTypesValidator} from "./ast-validation-modules/no-empty-object-types-validator";

const validators = [
    NoDuplicateTypesValidator,
    OnlyAllowedTypesValidator,
    KeyFieldValidator,
    EntityDirectiveNestingValidator,
    NoListOfReferencesValidator,
    RelationsOnlyInRootEntitiesValidator,
    RelationsOnlyToRootEntitiesValidator,
    ReferenceOnlyToRootEntitiesWithKeyFieldValidator,
    NoUnusedNonRootObjectTypesValidator,
    NoEmptyObjectTypesValidator
];

export interface ASTValidator {
    validate(ast: DocumentNode): ValidationMessage[];
}

export function validateModel(ast: DocumentNode): ValidationResult {
    return new ValidationResult(flatMap(validators, Validator => {
        // All validators rely on a valid model except for the things they test.
        // That's why they allow them to throw errors due to a bad model.
        // To keep the validators simple, we just ignore these errors and
        // trust on the appropriate validator for the modelling mistake.
        try {
            return new Validator().validate(ast)
        } catch(e) {
            return []
        }
    }));
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