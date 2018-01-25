import { ProjectSource } from '../../../src/project/source';
import { CheckJsonSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-json-syntax';

describe('check-json-syntax validator', () => {
    const validator = new CheckJsonSyntaxValidator();

    it('reports syntax errors', () => {
        const messages = validator.validate(new ProjectSource('test.json', '{"a": \ntrue test'));
        expect(messages.length).toBe(1);
        expect(messages[0].message).toBe("Unknown Character 't', expecting a comma or a closing '}'");
        expect(JSON.parse(JSON.stringify(messages[0].location))).toEqual({
            sourceName: 'test.json',
            start: { offset: 12, line: 2, column: 6 },
            end: { offset: 16, line: 2, column: 10 }
        });
    });

    it('reports syntax errors at the beginning', () => {
        const messages = validator.validate(new ProjectSource('test.json', 'abc'));
        expect(messages.length).toBe(1);
        expect(messages[0].message).toBe("Unknown character 'a', expecting opening block '{' or '[', or maybe a comment");
        expect(JSON.parse(JSON.stringify(messages[0].location))).toEqual({
            sourceName: 'test.json',
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 3, line: 1, column: 4 }
        });
    });

    it('accepts valid json', () => {
        const messages = validator.validate(new ProjectSource('file.json', '{"a": true}'));
        expect(messages).toEqual([]);
    });

    it('accepts json with comments', () => {
        const messages = validator.validate(new ProjectSource('file.json', '{"a": /* comment */ true}'));
        expect(messages).toEqual([]);
    });
});
