import { CheckGraphQLSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-graphql-syntax';
import { ProjectSource } from '../../../src/project/source';
import { expect } from 'chai';

describe('check-graphql-syntax validator', () => {
    const validator = new CheckGraphQLSyntaxValidator();

    it('reports syntax errors', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type \nTest invalid'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.contain('Name "invalid"');
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            "_end": {
                "column": 13,
                "line": 2,
                "offset": 18
            },
            "_start": {
                "column": 6,
                "line": 2,
                "offset": 11
            },
            "sourceName": "file.graphql"
        });
    });

    it('accepts valid GraphQL', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type Test { field: String }'));
        expect(messages).to.deep.equal([]);
    });
});
