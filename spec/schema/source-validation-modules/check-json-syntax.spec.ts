import { ProjectSource } from '../../../src/project/source';
import { expect } from 'chai';
import { getMessages } from './source-validation-helper';

describe('check-json-syntax validation', () => {
    it('reports syntax errors', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": \ntrue test'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            "Unknown Character 't', expecting a comma or a closing '}'",
        );
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 16,
            _start: 12,
            sourceName: 'test.json',
        });
    });

    it('reports syntax errors at the beginning', () => {
        const messages = getMessages(new ProjectSource('test.json', 'abc'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            "Unknown character 'a', expecting opening block '{' or '[', or maybe a comment",
        );
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 3,
            _start: 0,
            sourceName: 'test.json',
        });
    });

    it('accepts valid json', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": true}'));
        expect(messages).to.deep.equal([]);
    });

    it('accepts json with comments', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": /* comment */ true}'));
        expect(messages).to.deep.equal([]);
    });
});
