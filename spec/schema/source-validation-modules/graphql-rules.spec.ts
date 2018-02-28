import { CheckGraphQLSyntaxValidator } from '../../../src/schema/preparation/source-validation-modules/check-graphql-syntax';
import { ProjectSource } from '../../../src/project/source';
import { GraphQLRulesValidator } from '../../../src/schema/preparation/source-validation-modules/graphql-rules';

describe('graphql-rules validator', () => {
    const validator = new GraphQLRulesValidator();

    it('reports errors', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type Test @unknownDirective { field: String }'));
        expect(messages.length).toBe(1);
        expect(messages[0].message).toBe('Unknown directive "unknownDirective".');
    });

    it('accepts valid GraphQL', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type Test @rootEntity { field: String }'));
        expect(messages).toEqual([]);
    });
});
