import type { ArgumentNode, DirectiveNode, Location } from 'graphql';
import { MessageLocation } from '../validation/location.js';
import { TextChange } from './change-set.js';

/**
 * Creates a change that removes a node that shares its line with other content (e.g. a directive),
 * including the spaces before it
 *
 * If the node is on its own line, the whole line is removed.
 */
export function createRemoveInlineNodeChange(loc: Location): TextChange {
    const location = MessageLocation.fromGraphQLLocation(loc);
    const body = location.source.body;
    const textBefore = body.slice(0, loc.start);
    const spaceLength = textBefore.length - textBefore.replace(/[ \t]+$/, '').length;
    const start = loc.start - spaceLength;
    const restOfLine = /^[ \t]*(\r?\n|$)/.exec(body.slice(loc.end));
    if ((start === 0 || body[start - 1] === '\n') && restOfLine) {
        return new TextChange(
            new MessageLocation(location.source, start, loc.end + restOfLine[0].length),
            '',
        );
    }
    return new TextChange(new MessageLocation(location.source, start, loc.end), '');
}

/**
 * Creates a change that inserts text at the given offset of the source of a GraphQL location
 */
export function createInsertionChange(offset: number, loc: Location, text: string): TextChange {
    const location = MessageLocation.fromGraphQLLocation(loc);
    return new TextChange(new MessageLocation(location.source, offset, offset), text);
}

/**
 * Creates a change that removes a node that is on its own lines (e.g. a field or a type), including
 * the line break after it
 *
 * If there is other content on the first or last line, only the node and the spaces before it are
 * removed.
 */
export function createRemoveLinesChange(loc: Location): TextChange {
    const location = MessageLocation.fromGraphQLLocation(loc);
    const body = location.source.body;
    const lineStart = body.lastIndexOf('\n', loc.start - 1) + 1;
    const nextLineBreak = body.indexOf('\n', loc.end);
    const lineEnd = nextLineBreak < 0 ? body.length : nextLineBreak + 1;
    const isAloneOnLines =
        body.slice(lineStart, loc.start).trim() === '' &&
        body.slice(loc.end, lineEnd).trim() === '';
    if (!isAloneOnLines) {
        return createRemoveInlineNodeChange(loc);
    }
    return new TextChange(new MessageLocation(location.source, lineStart, lineEnd), '');
}

/**
 * Creates a change that removes an argument from a directive, including the parentheses if it is
 * the only argument
 */
export function createRemoveArgumentChange(
    directive: DirectiveNode,
    argument: ArgumentNode,
): TextChange | undefined {
    if (!directive.loc || !directive.name.loc || !argument.loc) {
        return undefined;
    }
    const location = MessageLocation.fromGraphQLLocation(directive.loc);
    if (directive.arguments?.length === 1) {
        return new TextChange(
            new MessageLocation(location.source, directive.name.loc.end, directive.loc.end),
            '',
        );
    }
    const body = location.source.body;
    let start = argument.loc.start;
    let end = argument.loc.end;
    const separatorAfter = /^\s*,?\s*/.exec(body.slice(end))![0];
    if (body.slice(end + separatorAfter.length).startsWith(')')) {
        // last argument: remove the separator before it instead
        start -= /,?\s*$/.exec(body.slice(0, start))![0].length;
    } else {
        end += separatorAfter.length;
    }
    return new TextChange(new MessageLocation(location.source, start, end), '');
}
