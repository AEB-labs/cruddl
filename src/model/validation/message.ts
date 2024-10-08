import {
    ArgumentNode,
    ASTNode,
    DirectiveNode,
    EnumValueDefinitionNode,
    FieldDefinitionNode,
    Kind,
    ListValueNode,
    print,
    TypeDefinitionNode,
} from 'graphql';
import {
    SUPPRESS_COMPATIBILITY_ISSUES_ARG,
    SUPPRESS_DIRECTIVE,
    SUPPRESS_INFOS_ARG,
    SUPPRESS_WARNINGS_ARG,
} from '../../schema/constants';
import {
    CompatibilityIssueCode,
    InfoCode,
    MessageCode,
    WarningCode,
} from './suppress/message-codes';
import { LocationLike, MessageLocation } from './location';
import { QuickFix } from './quick-fix';
import { ChangeSet, TextChange } from '../change-set/change-set';
import { isSuppressed } from './suppress/is-suppressed';
import { createSuppressQuickFix } from './suppress/quick-fix';

export enum Severity {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
    INFO = 'INFO',
    COMPATIBILITY_ISSUE = 'COMPATIBILITY_ISSUE',
}

export interface ValidationMessageOptions {
    readonly quickFixes?: ReadonlyArray<QuickFix>;
}

export interface SuppressableValidationMessageOptions extends ValidationMessageOptions {
    /**
     * The location where to report the message, in case it differs from the astNode
     */
    readonly location?: LocationLike;
}

export interface ValidationMessageParams {
    readonly severity: Severity;
    readonly message: string;
    readonly quickFixes?: ReadonlyArray<QuickFix>;
    readonly location?: LocationLike;
    readonly code?: MessageCode;
    readonly isSuppressed?: boolean;
}

export type AstNodeWithDirectives =
    | FieldDefinitionNode
    | TypeDefinitionNode
    | EnumValueDefinitionNode;

export class ValidationMessage {
    readonly severity: Severity;
    readonly message: string;
    readonly location: MessageLocation | undefined;
    readonly quickFixes: ReadonlyArray<QuickFix>;
    readonly isSuppressed: boolean;

    constructor(params: ValidationMessageParams) {
        this.severity = params.severity;
        this.message = params.message;
        this.location = params.location ? MessageLocation.from(params.location) : undefined;
        this.quickFixes = params.quickFixes ?? [];
        this.isSuppressed = params.isSuppressed ?? false;
    }

    public static suppressableMessage(
        severity: Severity.WARNING | Severity.INFO | Severity.COMPATIBILITY_ISSUE,
        code: MessageCode,
        message: string,
        astNode: AstNodeWithDirectives | undefined,
        options?: SuppressableValidationMessageOptions,
    ) {
        // not sure if this is the right time to do this
        // also does not allow us to detect superfluous directives at the moment
        const suppressed = isSuppressed(severity, astNode, code);
        let quickFixes = options?.quickFixes ?? [];
        if (!suppressed && astNode) {
            const suppressQuickFix = createSuppressQuickFix(severity, code, astNode);
            if (suppressQuickFix) {
                quickFixes = [...quickFixes, suppressQuickFix];
            }
        }
        return new ValidationMessage({
            severity,
            code,
            message,
            location: options?.location ?? astNode,
            isSuppressed: suppressed,
            quickFixes,
        });
    }

    public static error(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage({ severity: Severity.ERROR, message, location, ...options });
    }

    public static suppressableWarning(
        code: WarningCode,
        message: string,
        astNode: AstNodeWithDirectives | undefined,
        options?: SuppressableValidationMessageOptions,
    ) {
        return ValidationMessage.suppressableMessage(
            Severity.WARNING,
            code,
            message,
            astNode,
            options,
        );
    }

    public static nonSuppressableWarning(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage({
            severity: Severity.WARNING,
            message,
            location,
            ...options,
        });
    }

    public static suppressableInfo(
        code: InfoCode,
        message: string,
        astNode: AstNodeWithDirectives | undefined,
        options?: SuppressableValidationMessageOptions,
    ) {
        return ValidationMessage.suppressableMessage(
            Severity.INFO,
            code,
            message,
            astNode,
            options,
        );
    }

    public static nonSuppressableInfo(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage({
            severity: Severity.INFO,
            message,
            location,
            ...options,
        });
    }

    public static suppressableCompatibilityIssue(
        code: CompatibilityIssueCode,
        message: string,
        astNode: AstNodeWithDirectives | undefined,
        options?: SuppressableValidationMessageOptions,
    ) {
        return ValidationMessage.suppressableMessage(
            Severity.COMPATIBILITY_ISSUE,
            code,
            message,
            astNode,
            options,
        );
    }

    public static nonSuppressableCompatibilityIssue(
        message: string,
        location: LocationLike | undefined,
        options?: ValidationMessageOptions,
    ) {
        return new ValidationMessage({
            severity: Severity.COMPATIBILITY_ISSUE,
            message,
            location,
            ...options,
        });
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
