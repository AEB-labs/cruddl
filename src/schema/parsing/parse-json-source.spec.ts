import { describe, expect, it } from 'vitest';
import { ValidationContext, type ValidationMessage } from '../../model/index.js';
import { ProjectSource } from '../../project/source.js';
import { parseJSONSource } from './parse-json-source.js';

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
            `JSON file should define an object (is string)`,
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
                message: "Unknown character 't', expecting a comma or a closing '}'",
                location: { sourceName: 'test.json', _start: 12, _end: 16 },
            },
            {
                message: "Closing brace '}' expected.",
                location: { sourceName: 'test.json', _start: 16, _end: 16 },
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
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 3, _end: 3 },
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

    it('rejects input with control characters', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":"\u0001"}'));
        expect(messages).toMatchObject([
            {
                message: 'Invalid character.',
                location: { sourceName: 'test.json', _start: 5, _end: 9 },
            },
        ]);
    });

    it('rejects trailing commas in objects and arrays', () => {
        const objMessages = getMessages(new ProjectSource('test.json', '{"a": 1,}'));
        expect(objMessages).toMatchObject([
            {
                message: 'Property name expected.',
                location: { sourceName: 'test.json', _start: 8, _end: 9 },
            },
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 8, _end: 9 },
            },
        ]);
        const arrMessages = getMessages(new ProjectSource('test.json', '[1,2,]'));
        expect(arrMessages).toMatchObject([
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 5, _end: 6 },
            },
        ]);
    });

    it('rejects unterminated multi-line comments', () => {
        const messages = getMessages(new ProjectSource('test.json', '{/* unterminated "a": 1}'));
        expect(messages).toMatchObject([
            {
                message: 'Unexpected end of comment.',
                location: { sourceName: 'test.json', _start: 1, _end: 24 },
            },
            {
                message: "Closing brace '}' expected.",
                location: { sourceName: 'test.json', _start: 24, _end: 24 },
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
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 3, _end: 3 },
            },
        ]);
    });

    it('reports malformed input with an invalid symbol in an object', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": true test}'));
        expect(messages).toMatchObject([
            {
                message: "Unknown character 't', expecting a comma or a closing '}'",
                location: { sourceName: 'test.json', _start: 11, _end: 16 },
            },
        ]);
    });

    it('reports malformed input when a property name is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{1: 2}'));
        expect(messages).toMatchObject([
            {
                message: 'Property name expected.',
                location: { sourceName: 'test.json', _start: 1, _end: 6 },
            },
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 5, _end: 6 },
            },
        ]);
    });

    it('reports malformed input when a value is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": }'));
        expect(messages).toMatchObject([
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 6, _end: 7 },
            },
        ]);
    });

    it('reports malformed input when a colon is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a" 1}'));
        expect(messages).toMatchObject([
            {
                message: "Colon ':' expected.",
                location: { sourceName: 'test.json', _start: 5, _end: 7 },
            },
        ]);
    });

    it('reports malformed input when a comma is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": 1 "b":2}'));
        expect(messages).toMatchObject([
            {
                message: "Comma ',' expected.",
                location: { sourceName: 'test.json', _start: 8, _end: 14 },
            },
        ]);
    });

    it('reports malformed input when a closing brace is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":1'));
        expect(messages).toMatchObject([
            {
                message: "Closing brace '}' expected.",
                location: { sourceName: 'test.json', _start: 6, _end: 6 },
            },
        ]);
    });

    it('reports malformed input when a closing bracket is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', '[1,2'));
        expect(messages).toMatchObject([
            {
                message: "Closing bracket ']' expected.",
                location: { sourceName: 'test.json', _start: 4, _end: 4 },
            },
        ]);
    });

    it('reports malformed input when end of file is expected', () => {
        const messages = getMessages(new ProjectSource('test.json', 'true false'));
        expect(messages).toMatchObject([
            {
                message: 'End of file expected.',
                location: { sourceName: 'test.json', _start: 5, _end: 10 },
            },
        ]);
    });

    it('reports malformed input with an unexpected end of comment', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": /* x '));
        expect(messages).toMatchObject([
            {
                message: 'Unexpected end of comment.',
                location: { sourceName: 'test.json', _start: 6, _end: 11 },
            },
            {
                message: 'Value expected.',
                location: { sourceName: 'test.json', _start: 11, _end: 11 },
            },
            {
                message: "Closing brace '}' expected.",
                location: { sourceName: 'test.json', _start: 11, _end: 11 },
            },
        ]);
    });

    it('reports malformed input with an unexpected end of string', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": "x'));
        expect(messages).toMatchObject([
            {
                message: 'Unexpected end of string.',
                location: { sourceName: 'test.json', _start: 6, _end: 8 },
            },
            {
                message: "Closing brace '}' expected.",
                location: { sourceName: 'test.json', _start: 8, _end: 8 },
            },
        ]);
    });

    it('reports malformed input with an unexpected end of number', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a": 1e'));
        expect(messages).toMatchObject([
            {
                message: 'Unexpected end of number.',
                location: { sourceName: 'test.json', _start: 6, _end: 8 },
            },
            {
                message: "Closing brace '}' expected.",
                location: { sourceName: 'test.json', _start: 8, _end: 8 },
            },
        ]);
    });

    it('reports malformed input with invalid unicode', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":"\\u12G4"}'));
        expect(messages).toMatchObject([
            {
                message: 'Invalid unicode escape sequence.',
                location: { sourceName: 'test.json', _start: 5, _end: 14 },
            },
        ]);
    });

    it('reports malformed input with an invalid escape character', () => {
        const messages = getMessages(new ProjectSource('test.json', '{"a":"\\x"}'));
        expect(messages).toMatchObject([
            {
                message: 'Invalid escape character.',
                location: { sourceName: 'test.json', _start: 5, _end: 10 },
            },
        ]);
    });

    it('creates path locations for root, nested objects and arrays', () => {
        const source = new ProjectSource('path-map.json', '{"obj":{"arr":[1,{"x":"y"}]}}');
        const context = new ValidationContext();
        const parsed = parseJSONSource(source, {}, context);

        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed).to.not.be.undefined;

        expect(getLocationText(parsed!, '/', source.body)).to.equal(
            '{"obj":{"arr":[1,{"x":"y"}]}}',
        );
        expect(getLocationText(parsed!, '/obj', source.body)).to.equal('{"arr":[1,{"x":"y"}]}');
        expect(getLocationText(parsed!, '/obj/arr', source.body)).to.equal('[1,{"x":"y"}]');
        expect(getLocationText(parsed!, '/obj/arr/0', source.body)).to.equal('1');
        expect(getLocationText(parsed!, '/obj/arr/1', source.body)).to.equal('{"x":"y"}');
        expect(getLocationText(parsed!, '/obj/arr/1/x', source.body)).to.equal('"y"');
    });

    it('keeps locations aligned when comments are present', () => {
        const body =
            '{\n  // a comment\n  "a": 1,\n  "nested": {\n    /* block */\n    "b": 2\n  }\n}';
        const source = new ProjectSource('comments.json', body);
        const context = new ValidationContext();
        const parsed = parseJSONSource(source, {}, context);

        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed).to.not.be.undefined;

        const aLoc = parsed!.pathLocationMap['/a'];
        const bLoc = parsed!.pathLocationMap['/nested/b'];

        expect(aLoc).to.not.be.undefined;
        expect(bLoc).to.not.be.undefined;
        expect(source.body.slice(aLoc._start as number, aLoc._end as number)).to.equal('1');
        expect(source.body.slice(bLoc._start as number, bLoc._end as number)).to.equal('2');
        expect(aLoc._start).to.equal(source.body.indexOf('1'));
        expect(bLoc._start).to.equal(source.body.indexOf('2'));
    });

    it('escapes json pointer segments for slash and tilde in keys', () => {
        const source = new ProjectSource('escaped-keys.json', '{"a/b":{"~key":1}}');
        const context = new ValidationContext();
        const parsed = parseJSONSource(source, {}, context);

        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed).to.not.be.undefined;

        expect(getLocationText(parsed!, '/a~1b', source.body)).to.equal('{"~key":1}');
        expect(getLocationText(parsed!, '/a~1b/~0key', source.body)).to.equal('1');
        expect(parsed!.pathLocationMap['/a/b']).to.be.undefined;
    });

    it('does not fail with duplicate keys and keeps the last value location for a path', () => {
        const source = new ProjectSource('duplicate-keys.json', '{"dup":1,"dup":2}');
        const context = new ValidationContext();
        const parsed = parseJSONSource(source, {}, context);

        expect(context.asResult().messages).to.deep.equal([]);
        expect(parsed).to.not.be.undefined;
        expect(parsed!.object).toMatchObject({ dup: 2 });
        expect(getLocationText(parsed!, '/dup', source.body)).to.equal('2');
    });
});

function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseJSONSource(source, {}, validationContext);
    return validationContext.asResult().messages;
}

function getLocationText(
    parsed: NonNullable<ReturnType<typeof parseJSONSource>>,
    path: string,
    sourceText: string,
): string {
    const location = parsed.pathLocationMap[path];
    expect(location, `Missing location for path ${path}`).to.not.be.undefined;
    return sourceText.slice(location._start as number, location._end as number);
}
