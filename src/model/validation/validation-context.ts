import { ValidationMessage, ValidationResult } from './index';

export class ValidationContext {
    private readonly _validationMessages: ValidationMessage[] = [];

    addMessage(message: ValidationMessage) {
        this._validationMessages.push(message);
    }

    get validationMessages(): ReadonlyArray<ValidationMessage> {
        return this._validationMessages;
    }

    asResult(): ValidationResult {
        return new ValidationResult(this._validationMessages);
    }
}

export interface ModelComponent {
    validate(context: ValidationContext): void;
}
