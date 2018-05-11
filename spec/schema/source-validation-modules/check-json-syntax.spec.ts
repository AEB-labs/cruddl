import { ProjectSource } from '../../../src/project/source';
import { CheckJsonSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-json-syntax';
import { expect } from 'chai';

describe('check-json-syntax validator', () => {
    const validator = new CheckJsonSyntaxValidator();

    it('reports syntax errors', () => {
        const messages = validator.validate(new ProjectSource('test.json', '{"a": \ntrue test'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal("Unknown Character 't', expecting a comma or a closing '}'");
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            sourceName: 'test.json',
            start: { offset: 12, line: 2, column: 6 },
            end: { offset: 16, line: 2, column: 10 }
        });
    });

    it('reports syntax errors at the beginning', () => {
        const messages = validator.validate(new ProjectSource('test.json', 'abc'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal("Unknown character 'a', expecting opening block '{' or '[', or maybe a comment");
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            sourceName: 'test.json',
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 3, line: 1, column: 4 }
        });
    });

    it('accepts valid json', () => {
        const messages = validator.validate(new ProjectSource('file.json', '{"a": true}'));
        expect(messages).to.deep.equal([]);
    });

    it('accepts json with comments', () => {
        const messages = validator.validate(new ProjectSource('file.json', '{"a": /* comment */ true}'));
        expect(messages).to.deep.equal([]);
    });
});
