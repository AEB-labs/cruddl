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
        expect(messages).toMatchObject([
            {
                message: "Unknown Character 't', expecting a comma or a closing '}'",
                location: { sourceName: 'test.json', _start: 12, _end: 16 },
            },
        ]);
    });

    it('reports syntax errors at the beginning', () => {
        const messages = getMessages(new ProjectSource('test.json', 'abc'));
        expect(messages).toMatchObject([
            {
                message:
                    "Unknown character 'a', expecting opening block '{' or '[', or maybe a comment",
                location: { sourceName: 'test.json', _start: 0, _end: 3 },
            },
        ]);
    });

    it('accepts valid json', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": true}'));
        expect(messages).toMatchObject([]);
    });

    it('accepts json with multi line comments', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": /* comment */ true}'));
        expect(messages).toMatchObject([]);
    });

    it('accepts json with single line comments', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": \n// comment\n true}'));
        expect(messages).toMatchObject([]);
    });

    // behavior of json-lint, not necessarily good
    it('accepts input with control characters', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":"\u0001"}'));
        expect(messages).toMatchObject([]);
    });

    it('rejects trailing commas in objects and arrays', () => {
        const objMessages = getMessages(new ProjectSource('test.json', '{"a": 1,}'));
        expect(objMessages).toMatchObject([
            {
                message: "Unknown Character '}', expecting a string for key statement.",
                location: { sourceName: 'test.json', _start: 8, _end: 9 },
            },
        ]);
        const arrMessages = getMessages(new ProjectSource('test.json', '[1,2,]'));
        expect(arrMessages).toMatchObject([
            {
                message: 'Unexpected End Of Array Error. Expecting a value statement.',
                location: { sourceName: 'test.json', _start: 5, _end: 6 },
            },
        ]);
    });

    it('rejects unterminated multi-line comments', () => {
        const messages = getMessages(new ProjectSource('test.json', '{/* unterminated "a": 1}'));
        expect(messages).toMatchObject([
            {
                message: "EOF Error, expecting closing '}'.",
                location: { sourceName: 'test.json', _start: 25, _end: 24 },
            },
        ]);
    });

    it('reports malformed input with an invalid symbol at the beginning', () => {
        const messages = getMessages(new ProjectSource('test.json', 'abc'));
        expect(messages).toMatchObject([
            {
                message:
                    "Unknown character 'a', expecting opening block '{' or '[', or maybe a comment",
                location: { sourceName: 'test.json', _start: 0, _end: 3 },
            },
        ]);
    });

    it('reports malformed input with an invalid symbol in an object', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": true test}'));
        expect(messages).toMatchObject([
            {
                message: "Unknown Character 't', expecting a comma or a closing '}'",
                location: { sourceName: 'test.json', _start: 11, _end: 16 },
            },
        ]);
    });

    it('reports malformed input when a property name is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{1: 2}'));
        expect(messages).toMatchObject([
            {
                message: "Unknown Character '1', expecting a string for key statement.",
                location: { sourceName: 'test.json', _start: 1, _end: 6 },
            },
        ]);
    });

    it('reports malformed input when a value is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": }'));
        expect(messages).toMatchObject([
            {
                message: "Unknown Character '}', expecting a value.",
                location: { sourceName: 'test.json', _start: 6, _end: 7 },
            },
        ]);
    });

    it('reports malformed input when a colon is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a" 1}'));
        expect(messages).toMatchObject([
            {
                message: "Unknown Character '1', expecting a semicolon.",
                location: { sourceName: 'test.json', _start: 5, _end: 7 },
            },
        ]);
    });

    it('reports malformed input when a comma is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": 1 "b":2}'));
        expect(messages).toMatchObject([
            {
                message: "Unknown Character '\"', expecting a comma or a closing '}'",
                location: { sourceName: 'test.json', _start: 8, _end: 14 },
            },
        ]);
    });

    it('reports malformed input when a closing brace is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":1'));
        expect(messages).toMatchObject([
            {
                message: "EOF Error, expecting closing '}'.",
                location: { sourceName: 'test.json', _start: 7, _end: 6 },
            },
        ]);
    });

    it('reports malformed input when a closing bracket is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '[1,2'));
        expect(messages).toMatchObject([
            {
                message: "EOF Error. Expecting closing ']'",
                location: { sourceName: 'test.json', _start: 4, _end: 4 },
            },
        ]);
    });

    it('reports malformed input when end of file is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', 'true false'));
        expect(messages).toMatchObject([
            {
                message:
                    "Unknown character 't', expecting opening block '{' or '[', or maybe a comment",
                location: { sourceName: 'test.json', _start: 0, _end: 10 },
            },
        ]);
    });

    it('reports malformed input with an unexpected end of comment', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": /* x '));
        expect(messages).toMatchObject([
            {
                message: "EOF Error, expecting closing '}'.",
                location: { sourceName: 'test.json', _start: 13, _end: 11 },
            },
        ]);
    });

    it('reports malformed input with an unexpected end of string', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": "x'));
        expect(messages).toMatchObject([
            {
                message: `EOF: No close string '"' found.`,
                location: { sourceName: 'test.json', _start: 8, _end: 8 },
            },
        ]);
    });

    it('reports malformed input with an unexpected end of number', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": 1e'));
        expect(messages).toMatchObject([
            {
                message: "Unknown Character 'e', expecting a comma or a closing '}'",
                location: { sourceName: 'test.json', _start: 7, _end: 8 },
            },
        ]);
    });

    it('reports malformed input with invalid unicode', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":"\\u12G4"}'));
        expect(messages).toMatchObject([
            {
                message: "Invalid Reverse Solidus '\\' declaration.",
                location: { sourceName: 'test.json', _start: 6, _end: 14 },
            },
        ]);
    });

    it('reports malformed input with an invalid escape character', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":"\\x"}'));
        expect(messages).toMatchObject([
            {
                message: "Invalid Reverse Solidus '\\' declaration.",
                location: { sourceName: 'test.json', _start: 6, _end: 10 },
            },
        ]);
    });
});

function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseJSONSource(source, {}, validationContext);
    return validationContext.asResult().messages;
}
