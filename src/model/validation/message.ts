import { Location } from 'graphql';
import { ProjectSource } from '../../project/source';

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
    public readonly sourceName: string;

    public readonly source: ProjectSource|undefined;

    constructor(source: string|ProjectSource, public readonly start: SourcePosition, public readonly end: SourcePosition) {
        if (source instanceof ProjectSource) {
            Object.defineProperty(this, 'source', {
                enumerable: false
            });
            this.sourceName = source.name;
        } else {
            this.sourceName = source;
        }
    }

    static fromGraphQLLocation(loc: Location) {
        return new MessageLocation(
            ProjectSource.fromGraphQLSource(loc.source) || loc.source.name,
            new SourcePosition(loc.start, loc.startToken.line, loc.startToken.column),
            new SourcePosition(loc.end, loc.endToken.line, loc.endToken.column + loc.endToken.end - loc.endToken.start));
    }

    toString() {
        return `${this.sourceName}:${this.start.line}:${this.start.column}`;
    }

    private getSourcePath() {
        if (this.source && this.source.filePath) {
            return this.source.filePath;
        }
        return this.sourceName;
    }
}

export type LocationLike = MessageLocation|Location|{loc?: Location};

export class ValidationMessage {
    public readonly location: MessageLocation|undefined;

    constructor(public readonly severity: Severity,
                public readonly message: string,
                public readonly params: { [key: string]: string | number | boolean } = {},
                location?: LocationLike) {
        if (location && !(location instanceof MessageLocation)) {
            if ('loc' in location) {
                location = location.loc;
            }
            if (location) {
                location = MessageLocation.fromGraphQLLocation(location as Location);
            }
        }
        this.location = location;
    }

    public static error(message: string,
                        params: { [p: string]: string | number | boolean } = {},
                        location?: LocationLike) {
        return new ValidationMessage(Severity.Error, message, params, location);
    }

    public static warn(message: string,
                       params: { [p: string]: string | number | boolean } = {},
                       location?: LocationLike) {
        return new ValidationMessage(Severity.Warning, message, params, location);
    }

    public static info(message: string,
                       params: { [key: string]: string | number | boolean } = {},
                       location?: LocationLike) {
        return new ValidationMessage(Severity.Info, message, params, location);
    }

    public toString() {
        const at = this.location ? ` at ${this.location}` : '';
        return `${severityToString(this.severity)}: ${this.message}${at}`;
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
