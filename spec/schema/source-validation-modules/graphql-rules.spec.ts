import { ProjectSource } from '../../../src/project/source';
import { GraphQLRulesValidator } from '../../../src/schema/preparation/source-validation-modules/graphql-rules';
import { expect } from 'chai';

describe('graphql-rules validator', () => {
    const validator = new GraphQLRulesValidator();

    it('reports errors', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type Test @unknownDirective { field: String }'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal('Unknown directive "unknownDirective".');
    });

    it('accepts valid GraphQL', () => {
        const messages = validator.validate(new ProjectSource('file.graphql', 'type Test @rootEntity { field: String }'));
        expect(messages).to.deep.equal([]);
    });
});
