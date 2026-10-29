import { describe, expect, it } from 'vitest';
import { ProjectSource } from '../../project/source.js';
import { MessageLocation } from '../validation/location.js';
import { createRemoveWholeLinesChange } from './remove-lines.js';

describe('createRemoveWholeLinesChange', () => {
    function remove(body: string, text: string) {
        const start = body.indexOf(text);
        const change = createRemoveWholeLinesChange(
            new MessageLocation(new ProjectSource('test', body), start, start + text.length),
        );
        if (!change) {
            return undefined;
        }
        return (
            body.slice(0, change.location.start.offset) +
            change.newText +
            body.slice(change.location.end.offset)
        );
    }

    it('removes the lines and one of the surrounding blank lines', () => {
        expect(remove(`a: 1\n\nb: 2\n\nc: 3\n`, 'b: 2')).to.equal(`a: 1\n\nc: 3\n`);
    });

    it('removes one of the surrounding blank lines with CRLF line breaks', () => {
        expect(remove(`a: 1\r\n\r\nb: 2\r\n\r\nc: 3\r\n`, 'b: 2')).to.equal(`a: 1\r\n\r\nc: 3\r\n`);
    });

    it('does not remove anything if there is other content on the line', () => {
        expect(remove(`a: 1, b: 2\n`, 'b: 2')).to.be.undefined;
    });
});
