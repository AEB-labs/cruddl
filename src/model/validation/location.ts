import { ASTNode, Kind, Location } from 'graphql';
import { ProjectSource } from '../../project/source';
import { getLineAndColumnFromPosition } from '../../schema/schema-utils';

export class SourcePosition {
    /**
     * @param {number} offset the zero-based character offset within the source
     * @param {number} line the one-based line number
     * @param {number} column the one-based column number
     */
    constructor(
        public readonly offset: number,
        public readonly line: number,
        public readonly column: number,
    ) {}
}

export type LocationLike = MessageLocation | Location | ASTNode;

export class MessageLocation {
    public readonly sourceName: string;

    // ! - we set this as a property
    public readonly source!: ProjectSource;

    constructor(
        source: string | ProjectSource,
        readonly _start: SourcePosition | number,
        readonly _end: SourcePosition | number,
    ) {
        if (source instanceof ProjectSource) {
            Object.defineProperty(this, 'source', {
                enumerable: false,
                value: source,
            });
            this.sourceName = source.name;
        } else {
            this.sourceName = source;
            if (!(_start instanceof SourcePosition) || !(_end instanceof SourcePosition)) {
                throw new Error(
                    `If no ProjectSource is given, start and end positions must be SourcePositions.`,
                );
            }
            Object.defineProperty(this, 'source', {
                enumerable: false,
                value: new ProjectSource(this.sourceName, ''),
            });
        }

        if (typeof _start !== 'number' && !(_start instanceof SourcePosition)) {
            throw new Error(`start must be either a number or a SourcePosition`);
        }
        if (typeof _end !== 'number' && !(_end instanceof SourcePosition)) {
            throw new Error(`end must be either a number or a SourcePosition`);
        }
    }

    static from(location: LocationLike | undefined): MessageLocation | undefined {
        if (!location) {
            return undefined;
        }
        if (location instanceof MessageLocation) {
            return location;
        }
        if (isASTNode(location)) {
            if (!location.loc) {
                return undefined;
            }
            return MessageLocation.fromGraphQLLocation(location.loc);
        }
        return MessageLocation.fromGraphQLLocation(location);
    }

    static fromGraphQLLocation(loc: Location) {
        return new MessageLocation(
            ProjectSource.fromGraphQLSource(loc.source) || loc.source.name,
            new SourcePosition(loc.start, loc.startToken.line, loc.startToken.column),
            new SourcePosition(
                loc.end,
                loc.endToken.line,
                loc.endToken.column + loc.endToken.end - loc.endToken.start,
            ),
        );
    }

    get start(): SourcePosition {
        if (this._start instanceof SourcePosition) {
            return this._start;
        }
        if (!this.source) {
            throw new Error('Can not calculate start position without reference to source');
        }
        const lineAndColumn = getLineAndColumnFromPosition(this._start, this.source.body);

        return { offset: this._start, line: lineAndColumn.line, column: lineAndColumn.column };
    }

    get end(): SourcePosition {
        if (this._end instanceof SourcePosition) {
            return this._end;
        }
        if (!this.source) {
            throw new Error('Can not calculate end position without reference to source');
        }
        const lineAndColumn = getLineAndColumnFromPosition(this._end, this.source.body);

        return { offset: this._end, line: lineAndColumn.line, column: lineAndColumn.column };
    }

    toString() {
        return `${this.sourceName}:${this.start.line}:${this.start.column}`;
    }
}

export function isASTNode(obj: LocationLike): obj is ASTNode {
    return 'kind' in obj;
}

export function locationWithinStringArgument(
    node: LocationLike,
    offset: number,
    length: number,
): MessageLocation | undefined {
    if (isASTNode(node) && node.kind === Kind.STRING && node.loc) {
        const loc = node.loc;
        // add 1 because of "
        return new MessageLocation(
            ProjectSource.fromGraphQLSource(loc.source) || loc.source.name,
            new SourcePosition(
                loc.start + 1 + offset,
                loc.startToken.line,
                loc.startToken.column + 1 + offset,
            ),
            new SourcePosition(
                loc.start + 1 + offset + length,
                loc.endToken.line,
                loc.startToken.column + 1 + offset + length,
            ),
        );
    }

    let ml: MessageLocation;
    if (node instanceof MessageLocation) {
        ml = node;
    } else if (isASTNode(node)) {
        if (node.loc) {
            ml = MessageLocation.fromGraphQLLocation(node.loc);
        } else {
            return undefined;
        }
    } else {
        ml = MessageLocation.fromGraphQLLocation(node);
    }

    return locationWithinStringArgumentML(ml, offset, length);
}

function locationWithinStringArgumentML(
    loc: MessageLocation,
    offset: number,
    length: number,
): MessageLocation {
    // add 1 because of "
    return new MessageLocation(
        loc.source,
        new SourcePosition(
            loc.start.offset + 1 + offset,
            loc.start.line,
            loc.start.column + 1 + offset,
        ),
        new SourcePosition(
            loc.start.offset + 1 + offset + length,
            loc.start.line,
            loc.start.column + 1 + offset + length,
        ),
    );
}
