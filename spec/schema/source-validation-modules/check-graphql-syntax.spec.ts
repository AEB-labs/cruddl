import { expect } from 'chai';
import { ProjectSource } from '../../../src/project/source.js';
import { getMessages } from './source-validation-helper.js';

describe('check-graphql-syntax validator', () => {
    it('reports syntax errors', () => {
        const messages = getMessages(new ProjectSource('file.graphql', 'type \nTest invalid'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.contain('Name "invalid"');
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: {
                column: 13,
                line: 2,
                offset: 18,
            },
            _start: {
                column: 6,
                line: 2,
                offset: 11,
            },
            sourceName: 'file.graphql',
        });
    });

    it('accepts valid GraphQL', () => {
        const messages = getMessages(
            new ProjectSource('file.graphql', 'type Test { field: String }'),
        );
        expect(messages).to.deep.equal([]);
    });
});
