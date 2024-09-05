import { Severity, ValidationMessage } from './message';

export class ValidationResult {
    readonly messages: ReadonlyArray<ValidationMessage>;
    readonly suppressedMessages: ReadonlyArray<ValidationMessage>;

    constructor(public readonly allMessages: ReadonlyArray<ValidationMessage>) {
        this.suppressedMessages = allMessages.filter((m) => m.isSuppressed);
        this.messages = allMessages.filter((m) => !m.isSuppressed);
    }

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

    public hasCompatibilityIssues() {
        return this.messages.some((message) => message.severity === Severity.COMPATIBILITY_ISSUE);
    }

    public getCompatibilityIssues() {
        return this.messages.filter((message) => message.severity === Severity.COMPATIBILITY_ISSUE);
    }

    toString() {
        return this.messages.map((m) => m.toString()).join('\n');
    }
}
