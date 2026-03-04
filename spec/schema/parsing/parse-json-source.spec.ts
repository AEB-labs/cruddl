import { describe, expect, it } from 'vitest';
import { ValidationContext, type ValidationMessage } from '../../../src/model/index.js';
import { ProjectSource } from '../../../src/project/source.js';
import { parseJSONSource } from '../../../src/schema/parsing/parse-json-source.js';

describe('parseJSONSource', () => {
    it('parses JSON files', () => {
        const context = new ValidationContext();
        const parsed = parseJSONSource(
            new ProjectSource('test.json', '{"test": {"line": 123}}'),
            {},
            context,
        );
        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed!.object).to.deep.equal({
            test: {
                line: 123,
            },
        });
    });

    it('Returns undefined for empty JSON files', () => {
        const context = new ValidationContext();
        const parsed = parseJSONSource(new ProjectSource('empty.json', ''), {}, context);
        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed).to.be.undefined;
    });

    it('Reports validation error for non-object JSON files (strings)', () => {
        const context = new ValidationContext();
        const parsed = parseJSONSource(
            new ProjectSource('invalid.json', '"some-string"'),
            {},
            context,
        );
        expect(context.asResult().messages).to.have.lengthOf(1);
        expect(context.validationMessages[0].message).to.equal(
            `Unknown character '"', expecting opening block '{' or '[', or maybe a comment`,
        );
        expect(parsed).to.be.undefined;
    });

    it('Reports validation error for non-object JSON files (arrays)', () => {
        const context = new ValidationContext();
        const parsed = parseJSONSource(new ProjectSource('invalid.json', '[123]'), {}, context);
        expect(context.asResult().messages).to.have.lengthOf(1);
        expect(context.validationMessages[0].message).to.equal(
            `JSON file should define an object (is array)`,
        );
        expect(parsed).to.be.undefined;
    });

    it('Returns undefined for empty GraphQL files', () => {
        const context = new ValidationContext();
        const parsed = parseJSONSource(new ProjectSource('empty.graphqls', ''), {}, context);
        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed).to.be.undefined;
    });

    it('reports syntax errors', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": \ntrue test'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            "Unknown Character 't', expecting a comma or a closing '}'",
        );
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 16,
            _start: 12,
            sourceName: 'test.json',
        });
    });

    it('reports syntax errors at the beginning', () => {
        const messages = getMessages(new ProjectSource('test.json', 'abc'));
        expect(messages.length).to.equal(1);
        expect(messages[0].message).to.equal(
            "Unknown character 'a', expecting opening block '{' or '[', or maybe a comment",
        );
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: 3,
            _start: 0,
            sourceName: 'test.json',
        });
    });

    it('accepts valid json', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": true}'));
        expect(messages).to.deep.equal([]);
    });

    it('accepts json with comments', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": /* comment */ true}'));
        expect(messages).to.deep.equal([]);
    });
});

function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseJSONSource(source, {}, validationContext);
    return validationContext.asResult().messages;
}
