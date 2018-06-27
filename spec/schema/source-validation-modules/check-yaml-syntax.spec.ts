import { ProjectSource } from '../../../src/project/source';
import { CheckYamlSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-yaml-syntax';
import { expect } from 'chai';

describe('check-yaml-syntax validator', () => {
    const validator = new CheckYamlSyntaxValidator();

    it('reports syntax errors', () => {
        const messages = validator.validate(new ProjectSource('test.yaml', 'valid\nfoo: second colon: here\n '));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal("end of the stream or a document separator is expected");
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            "_end": {
                "column": 2,
                "line": 3,
                "offset": 31
            },
            "_start": {
                "column": 4,
                "line": 2,
                "offset": 9
            },
            "sourceName": "test.yaml"
        });
    });

    it('accepts valid yaml', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'a:\n  - test\n  - test2'));
        expect(messages).to.deep.equal([]);
    });
});
