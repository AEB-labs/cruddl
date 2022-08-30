import { ProjectSource } from '../../../src/project/source';
import { expect } from 'chai';
import { getMessages } from './source-validation-helper';

describe('check-yaml-syntax validator', () => {
    it('reports syntax errors', () => {
        const messages = getMessages(
            new ProjectSource('test.yaml', 'valid\nfoo: second colon: here\n '),
        );
        expect(messages.length).to.equal(2);
        expect(messages[0].message).to.equal(
            'end of the stream or a document separator is expected',
        );
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: {
                column: 24,
                line: 2,
                offset: 29,
            },
            _start: {
                column: 4,
                line: 2,
                offset: 9,
            },
            sourceName: 'test.yaml',
        });
    });

    it('accepts valid yaml', () => {
        const messages = getMessages(new ProjectSource('file.yaml', 'a:\n  - test\n  - test2'));
        expect(messages).to.deep.equal([]);
    });
});
