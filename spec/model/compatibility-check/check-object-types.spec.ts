import gql from 'graphql-tag';
import { expectQuickFix, expectSingleCompatibilityIssue } from '../implementation/validation-utils';
import { runCheck } from './utils';
import { ProjectSource } from '../../../src/project/source';
import { Project } from '../../../src/project/project';
import { expect } from 'chai';
import { applyChangeSet } from '../../../core-exports';
import { parseDocument } from 'yaml';

describe('checkModel', () => {
    describe('object types', () => {
        it('rejects if a field is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        wrongFieldName: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" is missing (required by module "module1").',
            );
            expectQuickFix(
                result,
                'Add field "field"',
                `type Test @rootEntity {
    wrongFieldName: String
    field: String
}`,
            );
        });

        it('includes field directives in the quickfix', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String
                            @calcMutations(operators: APPEND)
                            @key
                            @roles(read: ["a", "b"])
                            @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        wrongFieldName: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" is missing (required by module "module1").',
            );
            expectQuickFix(
                result,
                'Add field "field"',
                `type Test @rootEntity {
    wrongFieldName: String
    field: String @calcMutations(operators: APPEND) @key @roles(read: ["a", "b"])
}`,
            );
        });

        it('should include the field i18n with no existing translations when the quickfix is applied', () => {
            // project without any i18n
            const projectToCheck = new Project({
                sources: [
                    new ProjectSource(
                        'test.graphqls',
                        `type Test @rootEntity {
    wrongFieldName: String
}`,
                    ),
                ],
            });

            // baseline project has i18n for field
            const result = runCheck(
                [
                    gql`
                        type Test @rootEntity @modules(in: "module1") {
                            field: String @modules(all: true)
                        }
                    `,
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`,
                        '.i18n.test.yml',
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(2);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`type Test @rootEntity {
    wrongFieldName: String
    field: String
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.test.yml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                fields:
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`);
            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('should include the field i18n alongside existing field translations when the quickfix is applied', () => {
            const projectToCheck = new Project({
                sources: [
                    new ProjectSource(
                        'test.graphqls',
                        `type Test @rootEntity {
    wrongFieldName: String
}`,
                    ),
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld
    en:
        types:
            Test:
                fields:
                    wrongFieldName: Wrong Field`,
                    ),
                ],
            });

            const result = runCheck(
                [
                    gql`
                        type Test @rootEntity @modules(in: "module1") {
                            field: String @modules(all: true)
                        }
                    `,
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`,
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(2);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`type Test @rootEntity {
    wrongFieldName: String
    field: String
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.test.yml');

            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld
                    field: Feld
    en:
        types:
            Test:
                fields:
                    wrongFieldName: Wrong Field
                    field: Field`);

            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('should include the field i18n alongside partially existing field translations when the quickfix is applied', () => {
            const projectToCheck = new Project({
                sources: [
                    new ProjectSource(
                        'test.graphqls',
                        `type Test @rootEntity {
    wrongFieldName: String
}`,
                    ),
                    // en is missing from source
                    new ProjectSource(
                        '.i18n.test-special.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld`,
                    ),
                ],
            });

            const result = runCheck(
                [
                    gql`
                        type Test @rootEntity @modules(in: "module1") {
                            field: String @modules(all: true)
                        }
                    `,
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`,
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(2);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`type Test @rootEntity {
    wrongFieldName: String
    field: String
}`);
            // expect filename from checked project and not from baseline
            expect(changedProject.sources[1].name).to.equal('.i18n.test-special.yml');

            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`);

            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('should include the field i18n alongside existing field translations in separate files when the quickfix is applied', () => {
            const projectToCheck = new Project({
                sources: [
                    new ProjectSource(
                        'test.graphqls',
                        `type Test @rootEntity {
    wrongFieldName: String
}`,
                    ),
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld`,
                    ),
                    new ProjectSource(
                        '.i18n.test2.yml',
                        `i18n:
    en:
        types:
            Test:
                fields:
                    wrongFieldName: Wrong Field`,
                    ),
                ],
            });

            const result = runCheck(
                [
                    gql`
                        type Test @rootEntity @modules(in: "module1") {
                            field: String @modules(all: true)
                        }
                    `,
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`,
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(2);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(3);
            expect(changedProject.sources[0].body).to.eq(`type Test @rootEntity {
    wrongFieldName: String
    field: String
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.test.yml');

            const expectedTranslationFileDoc1 = parseDocument(`i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld
                    field: Feld`);

            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc1.toString());

            expect(changedProject.sources[2].name).to.equal('.i18n.test2.yml');

            const expectedTranslationFileDoc2 = parseDocument(`i18n:
    en:
        types:
            Test:
                fields:
                    wrongFieldName: Wrong Field
                    field: Field`);

            expect(changedProject.sources[2].body).to.equal(expectedTranslationFileDoc2.toString());
        });

        it('should not include the field i18n for existing translations when the quickfix is applied', () => {
            // project without any i18n
            const projectToCheck = new Project({
                sources: [
                    new ProjectSource(
                        'test.graphqls',
                        `type Test @rootEntity {
    wrongFieldName: String
}`,
                    ),
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld
                    field: Feld ist schon übersetzt
    en:
        types:
            Test:
                fields:
                    wrongFieldName: Wrong Field
                    field: Field already translated`,
                    ),
                ],
            });

            // baseline project has i18n for field
            const result = runCheck(
                [
                    gql`
                        type Test @rootEntity @modules(in: "module1") {
                            field: String @modules(all: true)
                        }
                    `,
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    field: Feld
    en:
        types:
            Test:
                fields:
                    field: Field`,
                        '.i18n.test.yml',
                    ),
                ],
                projectToCheck,
                { allowWarningsAndInfosInProjectToCheck: true },
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(2);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`type Test @rootEntity {
    wrongFieldName: String
    field: String
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.test.yml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                fields:
                    wrongFieldName: Falsches Feld
                    field: Feld ist schon übersetzt
    en:
        types:
            Test:
                fields:
                    wrongFieldName: Wrong Field
                    field: Field already translated`);
            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('should preserve leading/trailing comments in the i18n files when the quickfix is applied', () => {
            // project without any i18n
            const projectToCheck = new Project({
                sources: [
                    new ProjectSource(
                        'test.graphqls',
                        `type Test @rootEntity {
    wrongFieldName: String
}`,
                    ),
                ],
            });

            // baseline project has i18n for field
            const result = runCheck(
                [
                    gql`
                        type Test @rootEntity @modules(in: "module1") {
                            field: String @modules(all: true)
                            field2: String @modules(all: true)
                        }
                    `,
                    new ProjectSource(
                        '.i18n.test.yml',
                        `i18n:
    de:
        types:
            Test:
                fields:
                    # Special comment first entry
                    field: Feld # Trailing comment
                    # Normal field comment
                    field2:
                        label: Feld 2 # Trailing comment
    en:
        types:
            Test:
                fields:
                    # Special comment first entry
                    field: Field # Trailing comment
                    # Normal field comment
                    field2:
                        label: Field 2 # Trailing comment`,
                        '.i18n.test.yml',
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(2);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(2);
            // one time with - one time without i18n
            expect(result.getCompatibilityIssues()[1].quickFixes.length).to.equal(2);
            let changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[1].quickFixes[0].getChangeSet(),
            );
            changedProject = applyChangeSet(
                changedProject,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`type Test @rootEntity {
    wrongFieldName: String
    field: String
    field2: String
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.test.yml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                fields:
                    # Normal field comment
                    field2:
                        label: Feld 2 # Trailing comment
                    # Special comment first entry
                    field: Feld  # Trailing comment
    en:
        types:
            Test:
                fields:
                    # Normal field comment
                    field2:
                        label: Field 2 # Trailing comment
                    # Special comment first entry
                    field: Field  # Trailing comment`);
            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });
    });
});
