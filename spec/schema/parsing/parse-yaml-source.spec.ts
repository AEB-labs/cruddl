import { describe, expect, it } from 'vitest';
import { ValidationContext, type ValidationMessage } from '../../../src/model/index.js';
import { ProjectSource } from '../../../src/project/source.js';
import { parseYAMLSource } from '../../../src/schema/parsing/parse-yaml-source.js';

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
});

export function getMessages(source: ProjectSource): ReadonlyArray<ValidationMessage> {
    const validationContext = new ValidationContext();
    parseYAMLSource(source, {}, validationContext);
    return validationContext.asResult().messages;
}
