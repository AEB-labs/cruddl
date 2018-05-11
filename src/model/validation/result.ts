import { Severity, ValidationMessage } from './message';

export class ValidationResult {

    constructor(public readonly messages: ValidationMessage[]) {
    }

    public hasErrors() {
        return this.messages.some(message => message.severity === Severity.Error);
    }

    public hasWarnings() {
        return this.messages.some(message => message.severity === Severity.Warning);
    }

    public hasInfos() {
        return this.messages.some(message => message.severity === Severity.Info);
    }
}