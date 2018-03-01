import { CheckGraphQLSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-graphql-syntax';
import { ProjectSource } from '../../../src/project/source';

describe('check-graphql-syntax validator', () => {
    const validator = new CheckGraphQLSyntaxValidator();

    it('reports syntax errors', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type \nTest invalid'));
        expect(messages.length).toBe(1);
        expect(messages[0].message).toContain('Name "invalid"');
        expect(JSON.parse(JSON.stringify(messages[0].location))).toEqual({
            sourceName: 'file.graphql',
            start: { offset: 11, line: 2, column: 6 },
            end: { offset: 18, line: 2, column: 13 }
        });
    });

    it('accepts valid GraphQL', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type Test { field: String }'));
        expect(messages).toEqual([]);
    });
});
