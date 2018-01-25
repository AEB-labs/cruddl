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
    public readonly location: MessageLocation|undefined;

    constructor(public readonly severity: Severity,
                public readonly message: string,
                public readonly params: { [key: string]: string | number | boolean } = {},
                location?: MessageLocation|Location) {
        if (location && !(location instanceof MessageLocation)) {
            location = MessageLocation.fromGraphQLLocation(location);
        }
        this.location = location;
    }

    public static error(message: string,
                        params: { [p: string]: string | number | boolean } = {},
                        location?: MessageLocation | Location) {
        return new ValidationMessage(Severity.Error, message, params, location);
    }

    public static warn(message: string,
                       params: { [p: string]: string | number | boolean } = {},
                       location?: MessageLocation | Location) {
        return new ValidationMessage(Severity.Warning, message, params, location);
    }

    public static info(message: string,
                       params: { [key: string]: string | number | boolean } = {},
                       location?: MessageLocation|Location) {
        return new ValidationMessage(Severity.Info, message, params, location);
    }

    public toString() {
        const at = this.location ? ` at ${this.location.sourceName}:${this.location.start.line}:${this.location.start.column}` : '';
        return `${severityToString(this.severity)}${at}: ${this.message}`;
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
