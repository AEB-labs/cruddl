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
            "_end": {
                "column": 10,
                "line": 2,
                "offset": 16
            },
            "_start": {
                "column": 6,
                "line": 2,
                "offset": 12
            },
            "sourceName": "test.json"
        });
    });

    it('reports syntax errors at the beginning', () => {
        const messages = validator.validate(new ProjectSource('test.json', 'abc'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal("Unknown character 'a', expecting opening block '{' or '[', or maybe a comment");
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            "_end": {
                "column": 4,
                "line": 1,
                "offset": 3
            },
            "_start": {
                "column": 1,
                "line": 1,
                "offset": 0
            },
            "sourceName": "test.json"
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
