import type { Location } from 'graphql';
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
