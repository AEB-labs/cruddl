import { Location } from 'graphql';

export enum Severity {
    Error,
    Warning,
    Info
}

export class SourcePosition {
    /**
     * @param {number} offset the zero-based character offset within the source
     * @param {number} line the one-based line number
     * @param {number} column the one-based column number
     */
    constructor(public readonly offset: number, public readonly line: number, public readonly column: number) {}
}

export class MessageLocation {
    constructor(public readonly sourceName: string, public readonly start: SourcePosition, public readonly end: SourcePosition) {
    }

    static fromGraphQLLocation(loc: Location) {
        return new MessageLocation(
            loc.source.name || '',
            new SourcePosition(loc.start, loc.startToken.line, loc.startToken.column),
            new SourcePosition(loc.end, loc.endToken.line, loc.endToken.column + loc.endToken.end - loc.endToken.start));
    }
}

export class ValidationMessage {
    public readonly loc: MessageLocation|undefined;

    constructor(public readonly severity: Severity,
                public readonly msgKey: string,
                public readonly msgVars?: { [key: string]: string | number | boolean },
                loc?: MessageLocation|Location) {
        if (loc && !(loc instanceof MessageLocation)) {
            loc = MessageLocation.fromGraphQLLocation(loc);
        }
        this.loc = loc;
    }

    public static error(msgKey: string,
                        msgVars?: { [key: string]: string | number | boolean },
                        loc?: MessageLocation|Location) {
        return new ValidationMessage(Severity.Error, msgKey, msgVars, loc);
    }

    public static warn(msgKey: string,
                       msgVars?: { [key: string]: string | number | boolean },
                       loc?: MessageLocation|Location) {
        return new ValidationMessage(Severity.Warning, msgKey, msgVars, loc);
    }

    public static info(msgKey: string,
                       msgVars?: { [key: string]: string | number | boolean },
                       loc?: MessageLocation|Location) {
        return new ValidationMessage(Severity.Info, msgKey, msgVars, loc);
    }

    public toString() {
        const at = this.loc ? ` at ${this.loc.sourceName}:${this.loc.start.line}:${this.loc.start.column}` : '';
        return `${severityToString(this.severity)}${at}: ${this.msgKey}`;
    }
}

function severityToString(severity: Severity) {
    switch (severity) {
        case Severity.Error:
            return 'Error';
        case Severity.Info:
            return 'Info';
        case Severity.Warning:
            return 'Warning'
    }
}
