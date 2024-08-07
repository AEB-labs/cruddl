import { LocationLike, MessageLocation } from './location';
import { QuickFix } from './quick-fix';

export enum Severity {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
    INFO = 'INFO',
    COMPATIBILITY_ISSUE = 'COMPATIBILITY_ISSUE',
}

export interface ValidationMessageOptions {
    readonly quickFixes?: ReadonlyArray<QuickFix>;
}

export class ValidationMessage {
    readonly location: MessageLocation | undefined;
    readonly quickFixes: ReadonlyArray<QuickFix>;

    constructor(
        public readonly severity: Severity,
        public readonly message: string,
        location: LocationLike | undefined,
        options: ValidationMessageOptions = {},
    ) {
        this.location = location ? MessageLocation.from(location) : undefined;
        this.quickFixes = options.quickFixes ?? [];
    }

    public static error(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage(Severity.ERROR, message, location, options);
    }

    public static compatibilityIssue(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage(Severity.COMPATIBILITY_ISSUE, message, location, options);
    }

    public static warn(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage(Severity.WARNING, message, location, options);
    }

    public static info(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage(Severity.INFO, message, location, options);
    }

    public toString() {
        const at = this.location ? ` at ${this.location}` : '';
        return `${severityToString(this.severity)}: ${this.message}${at}`;
    }
}

function severityToString(severity: Severity) {
    switch (severity) {
        case Severity.ERROR:
            return 'Error';
        case Severity.INFO:
            return 'Info';
        case Severity.WARNING:
            return 'Warning';
        case Severity.COMPATIBILITY_ISSUE:
            return 'Compatibility issue';
    }
}
