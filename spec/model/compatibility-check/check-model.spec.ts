import { expect } from 'chai';
import gql from 'graphql-tag';
import { parseDocument } from 'yaml';
import { applyChangeSet, Project, ProjectSource } from '../../../core-exports';
import { prettyPrint } from '../../../src/graphql/pretty-print';
import {
    expectQuickFix,
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('basics', () => {
        it('accepts a simple case', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if a type is missing', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    // use the same name as in the baseline project to test the case where the quickfix appends it to the file
                    'baseline.graphql',
                    prettyPrint(gql`
                        type WrongTypeName @rootEntity {
                            field: String
                        }
                    `),
                ),
            ]);
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                projectToCheck,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" is missing (required by module "module1").',
            );
            expectQuickFix(
                result,
                'Add type "Test"',
                `type WrongTypeName @rootEntity {
    field: String
}

type Test @rootEntity {
    field: String
}
`,
                { project: projectToCheck },
            );
        });

        it('rejects if a type is of a completely wrong kind', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    enum Test {
                        VALUE1
                        VALUE2
                    }
                `,
            );
            expectSingleCompatibilityIssue(result, 'Type "Test" needs to be a root entity type.');
        });
    });

    describe('i18n quick-fixes', () => {
        it('it should add a type with its i18n when the quickfix is applied', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    'testwrong.graphql',
                    prettyPrint(gql`
                        type TestWrong @rootEntity {
                            field: String
                        }
                    `),
                ),
            ]);
            const result = runCheck(
                [
                    new ProjectSource(
                        'baseline.graphql',
                        prettyPrint(gql`
                            type Test @rootEntity @modules(in: "module1") {
                                field: String @modules(all: true)
                            }
                        `),
                    ),
                    new ProjectSource(
                        '.i18n.baseline.yaml',
                        `i18n:
    de:
        types:
            Test:
                label: Test
                labelPlural: Tests
                fields:
                    field: Feld
    en:
        types:
            Test:
                label: Test
                labelPlural: Tests
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
            expect(changedProject.sources[0].body).to.eq(`type TestWrong @rootEntity {
    field: String
}`);
            expect(changedProject.sources[1].body).to.eq(`type Test @rootEntity {
    field: String
}
`);
            expect(changedProject.sources[2].name).to.equal('.i18n.baseline.yaml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                label: Test
                labelPlural: Tests
                fields:
                    field: Feld
    en:
        types:
            Test:
                label: Test
                labelPlural: Tests
                fields:
                    field: Field`);
            expect(changedProject.sources[2].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('it should add a type with its i18n and comments when the quickfix is applied', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    'testwrong.graphql',
                    prettyPrint(gql`
                        type TestWrong @rootEntity {
                            field: String
                        }
                    `),
                ),
            ]);
            const result = runCheck(
                [
                    new ProjectSource(
                        'baseline.graphql',
                        prettyPrint(gql`
                            type Test @rootEntity @modules(in: "module1") {
                                field: String @modules(all: true)
                            }
                        `),
                    ),
                    new ProjectSource(
                        '.i18n.baseline.yaml',
                        `i18n:
    de:
        types:
            Test:
                # Leading comment
                label: Test
                labelPlural: Tests
                fields:
                    # Leading comment
                    field: Feld # Trailing comment
    en:
        types:
            Test:
                label: Test
                labelPlural: Tests
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
            expect(changedProject.sources[0].body).to.eq(`type TestWrong @rootEntity {
    field: String
}`);
            expect(changedProject.sources[1].body).to.eq(`type Test @rootEntity {
    field: String
}
`);
            expect(changedProject.sources[2].name).to.equal('.i18n.baseline.yaml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                # Leading comment
                label: Test
                labelPlural: Tests
                fields:
                    # Leading comment
                    field: Feld # Trailing comment
    en:
        types:
            Test:
                label: Test
                labelPlural: Tests
                fields:
                    field: Field`);
            expect(changedProject.sources[2].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('it should add an enum type with its i18n and comments when the quickfix is applied', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    'testwrong.graphql',
                    prettyPrint(gql`
                        type TestWrong @rootEntity {
                            field: String
                        }
                    `),
                ),
            ]);
            const result = runCheck(
                [
                    new ProjectSource(
                        'baseline.graphql',
                        prettyPrint(gql`
                            enum Test @modules(in: "module1") {
                                VALUE_A
                                VALUE_B
                                VALUE_C
                            }
                        `),
                    ),
                    new ProjectSource(
                        '.i18n.baseline.yaml',
                        `i18n:
    de:
        types:
            Test:
                # Leading comment
                label: Test
                labelPlural: Tests
                values:
                    # Leading comment
                    VALUE_A: Wert A
                    VALUE_B:
                        label: Wert B
                        hint: Das ist Wert B # Trailing comment
                    VALUE_C: Wert C
    en:
        types:
            Test:
                label: Test
                labelPlural: Tests
                values:
                    VALUE_A: Value A
                    VALUE_B:
                        label: Value B
                        hint: This is value B # Trailing comment
                    VALUE_C: Value C`,
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
            expect(changedProject.sources[0].body).to.eq(`type TestWrong @rootEntity {
    field: String
}`);
            expect(changedProject.sources[1].body).to.eq(`enum Test {
    VALUE_A
    VALUE_B
    VALUE_C
}
`);
            expect(changedProject.sources[2].name).to.equal('.i18n.baseline.yaml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                # Leading comment
                label: Test
                labelPlural: Tests
                values:
                    # Leading comment
                    VALUE_A: Wert A
                    VALUE_B:
                        label: Wert B
                        hint: Das ist Wert B # Trailing comment
                    VALUE_C: Wert C
    en:
        types:
            Test:
                label: Test
                labelPlural: Tests
                values:
                    VALUE_A: Value A
                    VALUE_B:
                        label: Value B
                        hint: This is value B # Trailing comment
                    VALUE_C: Value C`);
            expect(changedProject.sources[2].body).to.equal(expectedTranslationFileDoc.toString());
        });
    });
});
