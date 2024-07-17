import { Severity, ValidationMessage } from './message';

export class ValidationResult {
    constructor(public readonly messages: ValidationMessage[]) {}

    public hasMessages() {
        return this.messages.length > 0;
    }

    public hasErrors() {
        return this.messages.some((message) => message.severity === Severity.ERROR);
    }

    public getErrors() {
        return this.messages.filter((message) => message.severity === Severity.ERROR);
    }

    public hasWarnings() {
        return this.messages.some((message) => message.severity === Severity.WARNING);
    }

    public getWarnings() {
        return this.messages.filter((message) => message.severity === Severity.WARNING);
    }

    public hasInfos() {
        return this.messages.some((message) => message.severity === Severity.INFO);
    }

    public getInfos() {
        return this.messages.filter((message) => message.severity === Severity.INFO);
    }

    toString() {
        return this.messages.map((m) => m.toString()).join('\n');
    }
}
