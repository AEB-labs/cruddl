import { expect } from 'chai';
import { ParsedObjectProjectSource } from '../../src/config/parsed-project';
import { ValidationContext } from '../../src/model/validation';
import { ProjectSource } from '../../src/project/source';
import { parseProjectSource } from '../../src/schema/schema-builder';

describe('schema-builder', () => {
    describe('parseProjectSource', () => {
        it('parses YAML files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('test.yaml', 'test:\n  line: 123'), context);
            expect(context.asResult().messages).to.deep.equal([]);
            expect((parsed as ParsedObjectProjectSource).object).to.deep.equal({
                test: {
                    line: 123
                }
            });
        });

        it('Returns undefined for empty YAML files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('empty.yaml', ''), context);
            expect(context.asResult().messages).to.deep.equal([]);
            expect(parsed).to.be.undefined;
        });

        it('Reports validation error for non-object YAML files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('invalid.yaml', 'some-string'), context);
            expect(context.asResult().messages).to.have.lengthOf(1);
            expect(context.validationMessages[0].message).to.equal('YAML file should define an object (is string)');
            expect(parsed).to.be.undefined;
        });

        it('Reports validation error for non-object YAML files (arrays)', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('invalid.yaml', '[123]'), context);
            expect(context.asResult().messages).to.have.lengthOf(1);
            expect(context.validationMessages[0].message).to.equal(`YAML file should define an object (is array)`);
            expect(parsed).to.be.undefined;
        });

        it('Reports validation error for YAML files with references', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('invalid.yaml', 'foo: &anchor\n  contents: test\n\nreference: *anchor'), context);
            expect(context.asResult().messages).to.have.lengthOf(1);
            expect(context.validationMessages[0].message).to.equal(`Anchor references are not supported`);
        });

        it('parses JSON files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('test.json', '{"test": {"line": 123}}'), context);
            expect(context.asResult().messages).to.deep.equal([]);
            expect((parsed as ParsedObjectProjectSource).object).to.deep.equal({
                test: {
                    line: 123
                }
            });
        });

        it('Returns undefined for empty JSON files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('empty.json', ''), context);
            expect(context.asResult().messages).to.deep.equal([]);
            expect(parsed).to.be.undefined;
        });

        it('Reports validation error for non-object JSON files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('invalid.json', 'some-string'), context);
            expect(context.asResult().messages).to.have.lengthOf(1);
            expect(context.validationMessages[0].message).to.equal(`Unknown character 's', expecting opening block '{' or '[', or maybe a comment`);
            expect(parsed).to.be.undefined;
        });

        it('Reports validation error for non-object JSON files (arrays)', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('invalid.json', '[123]'), context);
            expect(context.asResult().messages).to.have.lengthOf(1);
            expect(context.validationMessages[0].message).to.equal(`JSON file should define an object (is array)`);
            expect(parsed).to.be.undefined;
        });

        it('Returns undefined for empty GraphQL files', () => {
            const context = new ValidationContext();
            const parsed = parseProjectSource(new ProjectSource('empty.graphqls', ''), context);
            expect(context.asResult().messages).to.deep.equal([]);
            expect(parsed).to.be.undefined;
        });
    });
});
