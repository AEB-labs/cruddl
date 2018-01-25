import { ProjectSource } from '../../../src/project/source';
import { CheckJsonSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-json-syntax';

describe('check-json-syntax validator', () => {
    const validator = new CheckJsonSyntaxValidator();

    it('reports syntax errors', () => {
        const messages = validator.validate(new ProjectSource('test.json', '{"a": \ntrue test'));
        expect(messages.length).toBe(1);
        expect(messages[0].msgKey).toBe("Unknown Character 't', expecting a comma or a closing '}'");
        expect(JSON.parse(JSON.stringify(messages[0].loc))).toEqual({
            sourceName: 'test.json',
            start: { offset: 12, line: 2, column: 6 },
            end: { offset: 16, line: 2, column: 10 }
        });
    });
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
