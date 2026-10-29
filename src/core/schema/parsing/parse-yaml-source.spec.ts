import { describe, expect, it } from 'vitest';
import { applyChangeSet } from '../../model/change-set/apply-change-set.js';
import { ChangeSet } from '../../model/change-set/change-set.js';
import { Severity, type ValidationMessage } from '../../model/validation/message.js';
import { ValidationContext } from '../../model/validation/validation-context.js';
import { Project } from '../../project/project.js';
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
        expect(messages[0].message).to.equal('Implicit keys need to be on a single line');
        expect(messages[0].location?.start.line).to.equal(1);
        expect(messages[1].message).to.equal('Nested mappings are not allowed in compact mappings');
        expect(JSON.parse(JSON.stringify(messages[1].location))).to.deep.equal({
            _start: 11,
            _end: 12,
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

    it('warns about unquoted true, false and null', () => {
        const { messages } = parseWithMessages('a: true\nb: "false"\nc: ~\n');
        expect(messages).toMatchObject([
            {
                severity: Severity.WARNING,
                message:
                    '"true" is currently read as a string, but will be read as a boolean in a future version. Put it in quotes to keep it a string.',
                location: { start: { line: 1, column: 4 } },
            },
            {
                severity: Severity.WARNING,
                message:
                    '"~" is currently read as a string, but will be read as null in a future version. Put it in quotes to keep it a string.',
                location: { start: { line: 3, column: 4 } },
            },
        ]);
    });

    it('offers to put unquoted true, false and null in quotes', () => {
        const body = 'a: true\nb:\n  - False\n  - ~\n';
        const source = new ProjectSource('test.yaml', body);
        const { messages } = parseWithMessages(body);
        const quickFixes = messages.flatMap((m) => m.quickFixes);
        expect(quickFixes.map((q) => q.description)).toEqual([
            'Put in quotes',
            'Put in quotes',
            'Put in quotes',
        ]);
        const changeSet = new ChangeSet(quickFixes.flatMap((q) => q.getChangeSet().changes));
        const newBody = applyChangeSet(new Project([source]), changeSet).sources[0].body;
        expect(newBody).toEqual('a: "true"\nb:\n  - "False"\n  - "~"\n');
        expect(parseWithMessages(newBody)).toMatchObject({
            messages: [],
            result: { object: { a: 'true', b: ['False', '~'] } },
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
        const result = parse('a:\nb:\n  -\n  - x\n');
        expect(result?.object).toEqual({ a: {}, b: [{}, 'x'] });
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

    it('reads keys like __proto__ as plain data', () => {
        const result = parse('__proto__:\n  polluted: yes\n');
        expect(Object.keys(result!.object)).toEqual(['__proto__']);
        expect(({} as any).polluted).to.be.undefined;
    });

    it('warns about tabs used for indentation', () => {
        const { result, messages } = parseWithMessages('a:\n  \tb: 1\n');
        expect(result?.object).toEqual({ a: { b: 1 } });
        expect(messages).toMatchObject([{ severity: Severity.WARNING }]);
    });

    it('reports an error for unresolvable tags', () => {
        const { result, messages } = parseWithMessages('a: !!int abc\n');
        expect(result).to.be.undefined;
        expect(messages).toMatchObject([{ severity: Severity.ERROR }]);
    });

    it('escapes keys in location paths like JSON pointers', () => {
        const result = parse('a/b: 1\nc~d: 2\n');
        expect(Object.keys(result!.pathLocationMap)).toEqual(
            expect.arrayContaining(['/a~1b', '/c~0d']),
        );
    });

    it('reports locations of objects in arrays', () => {
        const result = parse('permissions:\n  - roles: [admin]\n    access: read\n');
        const loc = result!.pathLocationMap['/permissions/0'];
        expect(loc.start.line).to.equal(2);
        expect(loc.start.column).to.equal(5);
        expect(loc.end.line).to.equal(3);
    });

    it('accepts files with only whitespace or comments', () => {
        expect(getMessages(new ProjectSource('test.yaml', '  \n\n'))).toEqual([]);
        expect(getMessages(new ProjectSource('test.yaml', '# comment\n'))).toEqual([]);
    });

    it('reports an error for binary values', () => {
        const messages = getMessages(new ProjectSource('test.yaml', 'a: !!binary aGVsbG8=\n'));
        expect(messages).toMatchObject([
            { message: 'Unsupported YAML value with tag tag:yaml.org,2002:binary' },
        ]);
    });

    it('reports an error for complex keys', () => {
        const messages = getMessages(new ProjectSource('test.yaml', '? [a, b]\n: value\n'));
        expect(messages).toMatchObject([{ message: 'Only simple keys are supported' }]);
    });

    it('reports an error for multiple documents', () => {
        const messages = getMessages(new ProjectSource('test.yaml', 'a: 1\n---\nb: 2\n'));
        expect(messages).toMatchObject([{ message: 'YAML file should contain a single document' }]);
    });

    it('reports an error for duplicate keys', () => {
        const messages = getMessages(new ProjectSource('test.yaml', 'a: 1\na: 2\n'));
        expect(messages.length).to.equal(1);
        expect(messages[0].severity).to.equal(Severity.ERROR);
        expect(messages[0].location?.start.line).to.equal(2);
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
