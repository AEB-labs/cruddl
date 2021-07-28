import { ParsedProjectSourceBaseKind } from '../../../src/config/parsed-project';
import { ValidationContext } from '../../../src/model/validation';
import { ProjectSource } from '../../../src/project/source';
import { expect } from 'chai';
import { parseProjectSource } from '../../../src/schema/schema-builder';

const yamlContent = `
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

`;

const correspondingObject = { a: { b: { c: 'apfel' } }, d: ['test1', 'test2', 'test3'], e: [0, 1, 2] };

describe('YAML parser and validator', () => {
    it('returns the right message locations', () => {
        const source = new ProjectSource('test.yaml', yamlContent);
        const validationContext = new ValidationContext();
        const result = parseProjectSource(source, {}, validationContext);
        if (!result) {
            expect(result).not.to.be.undefined;
            return;
        }

        if (result.kind == ParsedProjectSourceBaseKind.OBJECT) {
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
        } else {
            expect(result.kind).to.eq(ParsedProjectSourceBaseKind.OBJECT);
        }
    });

    it('can extract the corresponding json data', () => {
        const source = new ProjectSource('test.yaml', yamlContent);
        const validationContext = new ValidationContext();
        const result = parseProjectSource(source, {}, validationContext);
        if (!result) {
            expect(result).not.to.be.undefined;
            return;
        }

        if (result.kind == ParsedProjectSourceBaseKind.OBJECT) {
            expect(result.object).to.deep.equals(correspondingObject);
        } else {
            expect(result.kind).to.eq(ParsedProjectSourceBaseKind.OBJECT);
        }
    });

    it('accepts empty files', () => {
        const source = new ProjectSource('test.yaml', '');
        const validationContext = new ValidationContext();
        const result = parseProjectSource(source, {}, validationContext);

        expect(validationContext.asResult().hasErrors(), validationContext.asResult().toString()).to.be.false;
        expect(result).to.be.undefined;
    });

    it('does not break when node is undefined', () => {
        const source = new ProjectSource(
            'test.yaml',
            `
i18n:
  de: `
        );
        const validationContext = new ValidationContext();
        const result = parseProjectSource(source, {}, validationContext);

        expect(result).to.not.be.undefined;
    });
});
