import { describe, expect, it } from 'vitest';
import { ValidationContext, type ValidationMessage } from '../../../src/model/index.js';
import { ProjectSource } from '../../../src/project/source.js';
import { parseGraphQLSource } from '../../../src/schema/parsing/parse-graphql-source.js';

describe('parseGraphQLSource', () => {
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
        expect(messages).toEqual([]);
    });
});

function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseGraphQLSource(source, {}, validationContext);
    return validationContext.asResult().messages;
}
