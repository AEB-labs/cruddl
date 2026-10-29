import { MessageLocation } from '../validation/location.js';
import { TextChange } from './change-set.js';

/**
 * Creates a change that removes the lines of a location, including the line break after it
 *
 * One of the blank lines around the location is removed as well, so removing e.g. a type between
 * two others does not leave two blank lines.
 *
 * @returns the change, or undefined if there is other content on the first or last line
 */
export function createRemoveWholeLinesChange(location: MessageLocation): TextChange | undefined {
    const body = location.source.body;
    const start = location.start.offset;
    const end = location.end.offset;
    const lineStart = body.lastIndexOf('\n', start - 1) + 1;
    const nextLineBreak = body.indexOf('\n', end);
    const lineEnd = nextLineBreak < 0 ? body.length : nextLineBreak + 1;
    const isAloneOnLines =
        body.slice(lineStart, start).trim() === '' && body.slice(end, lineEnd).trim() === '';
    if (!isAloneOnLines) {
        return undefined;
    }
    const isPreviousLineBlank = lineStart === 0 || /\n[ \t]*\r?\n$/.test(body.slice(0, lineStart));
    const nextBlankLine = /^[ \t]*\r?\n/.exec(body.slice(lineEnd));
    const removeEnd =
        isPreviousLineBlank && nextBlankLine ? lineEnd + nextBlankLine[0].length : lineEnd;
    return new TextChange(new MessageLocation(location.source, lineStart, removeEnd), '');
}
