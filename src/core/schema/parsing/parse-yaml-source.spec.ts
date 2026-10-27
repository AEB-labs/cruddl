import { describe, expect, it } from 'vitest';
import { Severity, type ValidationMessage } from '../../model/validation/message.js';
import { ValidationContext } from '../../model/validation/validation-context.js';
import { ProjectSource } from '../../project/source.js';
import { parseYAMLSource } from './parse-yaml-source.js';

describe('parseYAMLSource', () => {
    it('extracts data and locations', () => {
        const source = new ProjectSource(
            'test.yaml',
            `
a:
  b:
    c: apfel
d:
  - test1
  - test2
  - test3
e:
  - 0
  - 1
  - 2

`,
        );
        const validationContext = new ValidationContext();
        const result = parseYAMLSource(source, {}, validationContext)!;
        expect(result).not.to.be.undefined;

        expect(result.object).to.deep.equals({
            a: { b: { c: 'apfel' } },
            d: ['test1', 'test2', 'test3'],
            e: [0, 1, 2],
        });

        expect(result.pathLocationMap['/a']._start).to.be.eq(1);
        expect(result.pathLocationMap['/a']._end).to.be.eq(21);

        expect(result.pathLocationMap['/a/b']._start).to.be.eq(6);
        expect(result.pathLocationMap['/a/b']._end).to.be.eq(21);

        expect(result.pathLocationMap['/a/b/c']._start).to.be.eq(13);
        expect(result.pathLocationMap['/a/b/c']._end).to.be.eq(21);

        expect(result.pathLocationMap['/a'].start.line).to.be.eq(2);
        expect(result.pathLocationMap['/a/b'].start.line).to.be.eq(3);
        expect(result.pathLocationMap['/a/b/c'].start.line).to.be.eq(4);

        expect(result.pathLocationMap['/d/0'].start.line).to.be.eq(6);
        expect(result.pathLocationMap['/d/0'].start.column).to.be.eq(5);
        expect(result.pathLocationMap['/d/0'].end.line).to.be.eq(6);
        expect(result.pathLocationMap['/d/0'].end.column).to.be.eq(10);
    });

    it('reports location of some yaml property', () => {
        const context = new ValidationContext();
        const parsed = parseYAMLSource(
            new ProjectSource(
                'test.yaml',
                `
                        root:
                            sub:
                                field: value
                `,
            ),
            {},
            context,
        );
        const loc = parsed!.pathLocationMap['/root/sub/field'];
        expect(loc.start.line).to.equal(4);
        expect(loc.start.column).to.equal(33);
    });

    it('reports location of an empty yaml property', () => {
        const context = new ValidationContext();
        const parsed = parseYAMLSource(
            new ProjectSource(
                'test.yaml',
                `
                        root:
                            sub:
                                field:
`,
            ),
            {},
            context,
        );
        const loc = parsed!.pathLocationMap['/root/sub/field'];
        expect(loc.start.line).to.equal(4);
        expect(loc.start.column).to.equal(33);
    });

    it('accepts empty files', () => {
        const source = new ProjectSource('test.yaml', '');
        const validationContext = new ValidationContext();
        const result = parseYAMLSource(source, {}, validationContext);

        expect(validationContext.validationMessages).toEqual([]);
        expect(result).to.be.undefined;
    });

    it('does not break when node is undefined', () => {
        const source = new ProjectSource(
            'test.yaml',
            `
i18n:
  de: `,
        );
        const validationContext = new ValidationContext();
        const result = parseYAMLSource(source, {}, validationContext);

        expect(validationContext.validationMessages).toEqual([]);
        expect(result?.object).toEqual({ i18n: { de: {} } });
    });

    it('does not report errors in valid yaml', () => {
        const messages = getMessages(new ProjectSource('file.yaml', 'a:\n  - test\n  - test2'));
        expect(messages).toEqual([]);
    });

    it('reports syntax errors', () => {
        const messages = getMessages(
            new ProjectSource('test.yaml', 'valid\nfoo: second colon: here\n '),
        );
        expect(messages.length).to.equal(2);
        expect(messages[0].message).to.equal(
            'end of the stream or a document separator is expected',
        );
        expect(JSON.parse(JSON.stringify(messages[0].location))).to.deep.equal({
            _end: {
                column: 24,
                line: 2,
                offset: 29,
            },
            _start: {
                column: 4,
                line: 2,
                offset: 9,
            },
            sourceName: 'test.yaml',
        });
    });

    it('Reports validation error for non-object YAML files (strings)', () => {
        const messages = getMessages(new ProjectSource('invalid.yaml', 'some-string'));
        expect(messages).toMatchObject([
            { message: 'YAML file should define an object (is string)' },
        ]);
    });

    it('Reports validation error for non-object YAML files (arrays)', () => {
        const messages = getMessages(new ProjectSource('invalid.yaml', '[123]'));
        expect(messages).toMatchObject([
            { message: 'YAML file should define an object (is array)' },
        ]);
    });

    it('Reports validation error for YAML files with references', () => {
        const messages = getMessages(
            new ProjectSource(
                'invalid.yaml',
                'foo: &anchor\n  contents: test\n\nreference: *anchor',
            ),
        );
        expect(messages).toMatchObject([{ message: 'Anchor references are not supported' }]);
    });

    it('reads unquoted true, false and null as strings', () => {
        const { result } = parseWithMessages('a: true\nb: False\nc: null\nd: ~\ne: yes\nf: on\n');
        expect(result?.object).toEqual({
            a: 'true',
            b: 'False',
            c: 'null',
            d: '~',
            e: 'yes',
            f: 'on',
        });
    });

    it('reads numbers', () => {
        const result = parse('a: 1\nb: -2.5\nc: 1e3\nd: 0x10\ne: "1"\nf: 1_000\ng: .inf\n');
        expect(result?.object).toEqual({
            a: 1,
            b: -2.5,
            c: 1000,
            d: 16,
            e: '1',
            f: '1_000',
            g: '.inf',
        });
    });

    it('reads empty values as empty objects', () => {
        const result = parse('a:\nb: x\n');
        expect(result?.object).toEqual({ a: {}, b: 'x' });
    });

    it('reads flow collections', () => {
        const result = parse('a: {x: 1, y: [1, "2"]}\n');
        expect(result?.object).toEqual({ a: { x: 1, y: [1, '2'] } });
        expect(result?.pathLocationMap['/a/y/1'].start.column).to.equal(18);
    });

    it('reports locations in files with CRLF line breaks', () => {
        const result = parse('a:\r\n  b: 1\r\n  c:\r\n    - x\r\n');
        expect(result?.object).toEqual({ a: { b: 1, c: ['x'] } });
        expect(result?.pathLocationMap['/a/c/0'].start.line).to.equal(4);
        expect(result?.pathLocationMap['/a/c/0'].start.column).to.equal(7);
    });

    it('keeps plain keys as written', () => {
        const result = parse('True: yes\nFalse: no\nnull: x\n1.0: y\n0x10: z\n');
        expect(Object.keys(result!.object)).toEqual(['True', 'False', 'null', '1.0', '0x10']);
    });

    it('accepts plain keys that only differ in spelling', () => {
        const result = parse('True: 1\ntrue: 2\nnull: 3\n~: 4\n1: 5\n01: 6\n');
        expect(result?.object).toEqual({ True: 1, true: 2, null: 3, '~': 4, '1': 5, '01': 6 });
    });

    it('resolves escapes in quoted keys', () => {
        const result = parse(`"a\\"b": 1\n'c''d': 2\n"True": 3\n`);
        expect(Object.keys(result!.object)).toEqual(['a"b', "c'd", 'True']);
    });

    it('warns about tabs used for indentation', () => {
        const { result, messages } = parseWithMessages('a:\n  \tb: 1\n');
        expect(result?.object).toEqual({ a: { b: 1 } });
        expect(messages).toMatchObject([{ severity: Severity.WARNING }]);
    });

    it('reports an error for unresolvable tags', () => {
        const { result, messages } = parseWithMessages('a: !!int abc\n');
        expect(result).to.be.undefined;
        expect(messages[0]).toMatchObject({ severity: Severity.ERROR });
    });
});

function parseWithMessages(body: string) {
    const validationContext = new ValidationContext();
    const result = parseYAMLSource(new ProjectSource('test.yaml', body), {}, validationContext);
    return { result, messages: validationContext.validationMessages };
}

function parse(body: string) {
    const { result, messages } = parseWithMessages(body);
    expect(messages).toEqual([]);
    return result;
}

export function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseYAMLSource(source, {}, validationContext);
    return validationContext.asResult().messages;
}
