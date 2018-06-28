import { ASTNode, Location } from 'graphql';
import { ProjectSource } from '../../project/source';
import { getLineAndColumnFromPosition } from '../../schema/schema-utils';

export enum Severity {
    Error = 'ERROR',
    Warning = 'WARNING',
    Info = 'INFO'
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

    constructor(source: string|ProjectSource, readonly _start: SourcePosition | number, readonly _end: SourcePosition | number) {
        if (source instanceof ProjectSource) {
            Object.defineProperty(this, 'source', {
                enumerable: false,
                value: source
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

    get start(): SourcePosition {
        if(this._start instanceof  SourcePosition) {
            return this._start;
        }
        if(!this.source){
            throw new Error("Can not calculate start position without reference to source");
        }
        const lineAndColumn = getLineAndColumnFromPosition(this._start, this.source.body);

        return {offset: this._start, line: lineAndColumn.line, column: lineAndColumn.column};
    }

    get end(): SourcePosition {
        if(this._end instanceof  SourcePosition) {
            return this._end;
        }
        if(!this.source){
            throw new Error("Can not calculate end position without reference to source");
        }
        const lineAndColumn = getLineAndColumnFromPosition(this._end, this.source.body);

        return {offset: this._end, line: lineAndColumn.line, column: lineAndColumn.column};
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

export type LocationLike = MessageLocation|Location|ASTNode;

export class ValidationMessage {
    public readonly location: MessageLocation|undefined;

    constructor(public readonly severity: Severity,
                public readonly message: string,
                location?: LocationLike) {
        if (location && !(location instanceof MessageLocation)) {
            if (isASTNode(location)) {
                location = location.loc;
            }
            if (location) {
                location = MessageLocation.fromGraphQLLocation(location);
            }
        }
        this.location = location;
    }

    public static error(message: string,
                        location: LocationLike | undefined) {
        return new ValidationMessage(Severity.Error, message, location);
    }

    public static warn(message: string,
                       location: LocationLike | undefined) {
        return new ValidationMessage(Severity.Warning, message, location);
    }

    public static info(message: string,
                       location: LocationLike | undefined) {
        return new ValidationMessage(Severity.Info, message, location);
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

function isASTNode(obj: any): obj is ASTNode {
    return 'kind' in obj;
}
