import { expect } from 'chai';
import gql from 'graphql-tag';
import { parseDocument } from 'yaml';
import { prettyPrint } from '../../../src/graphql/pretty-print';
import { applyChangeSet } from '../../../src/model/change-set/apply-change-set';
import { Project } from '../../../src/project/project';
import { ProjectSource } from '../../../src/project/source';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('enums', () => {
        it('rejects if an enum value is missing', () => {
            const result = runCheck(
                gql`
                    enum Test @modules(in: "module1") {
                        VALUE1
                        VALUE2
                    }
                `,
                gql`
                    enum Test {
                        VALUE1
                    }
                `,
            );
            expectSingleCompatibilityIssue(result, 'Enum value "VALUE2" is missing.');
        });

        it('accepts an additional enum value', () => {
            const result = runCheck(
                gql`
                    enum Test @modules(in: "module1") {
                        VALUE1
                        VALUE2
                    }
                `,
                gql`
                    enum Test {
                        VALUE1
                        VALUE2
                        VALUE3
                    }
                `,
            );
            expectToBeValid(result);
        });
    });

    describe('i18n quick-fixes', () => {
        it('it should add a value with its i18n text when the quickfix is applied', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    'baseline.graphql',
                    prettyPrint(gql`
                        enum Test {
                            VALUE1
                        }
                    `),
                ),
            ]);

            const result = runCheck(
                [
                    gql`
                        enum Test @modules(in: "module1") {
                            VALUE1
                            VALUE2
                        }
                    `,
                    new ProjectSource(
                        '.i18n.baseline.yaml',
                        `i18n:
    de:
        types:
            Test:
                values:
                    VALUE2: Wert 2
    en:
        types:
            Test:
                values:
                    VALUE2: Value 2 
                `,
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with, one time without i18n, suppress quickfix
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(3);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`enum Test {
    VALUE1
    VALUE2
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.baseline.yaml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                values:
                    VALUE2: Wert 2
    en:
        types:
            Test:
                values:
                    VALUE2: Value 2 
                `);
            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('it should add a value with its i18n text with existing i18n when the quickfix is applied', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    'baseline.graphql',
                    prettyPrint(gql`
                        enum Test {
                            VALUE1
                        }
                    `),
                ),
                new ProjectSource(
                    '.i18n.baseline-custom.yaml',
                    `i18n:
    de:
        types:
            Test:
                values:
                    VALUE1: Wert 1`,
                ),
            ]);

            const result = runCheck(
                [
                    gql`
                        enum Test @modules(in: "module1") {
                            VALUE1
                            VALUE2
                        }
                    `,
                    new ProjectSource(
                        '.i18n.baseline.yaml',
                        `i18n:
    de:
        types:
            Test:
                values:
                    VALUE1: Wert 1 aus Baseline
                    VALUE2: Wert 2
    en:
        types:
            Test:
                values:
                    VALUE1: Value 1 from baseline
                    VALUE2: Value 2 
                `,
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with, one time without i18n, suppress quickfix
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(3);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`enum Test {
    VALUE1
    VALUE2
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.baseline-custom.yaml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                values:
                    VALUE1: Wert 1
                    VALUE2: Wert 2
    en:
        types:
            Test:
                values:
                    VALUE2: Value 2 
                `);
            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });

        it('it should add a value with its i18n text including comments when the quickfix is applied', () => {
            const projectToCheck = new Project([
                new ProjectSource(
                    'baseline.graphql',
                    prettyPrint(gql`
                        enum Test {
                            VALUE1
                        }
                    `),
                ),
            ]);

            const result = runCheck(
                [
                    gql`
                        enum Test @modules(in: "module1") {
                            VALUE1
                            VALUE2
                        }
                    `,
                    new ProjectSource(
                        '.i18n.baseline.yaml',
                        `i18n:
    de:
        types:
            Test:
                values:
                    # Leading comment
                    VALUE2: Wert 2 # Trailing comment
    en:
        types:
            Test:
                values:
                    VALUE1: Value 1
                    # Leading comment
                    VALUE2: Value 2 # Trailing comment
                    
                `,
                    ),
                ],
                projectToCheck,
            );

            expect(result.getCompatibilityIssues().length).to.equal(1);
            // one time with, one time without i18n, suppress quickfix
            expect(result.getCompatibilityIssues()[0].quickFixes.length).to.equal(3);
            const changedProject = applyChangeSet(
                projectToCheck,
                result.getCompatibilityIssues()[0].quickFixes[0].getChangeSet(),
            );
            expect(changedProject.sources.length).to.equal(2);
            expect(changedProject.sources[0].body).to.eq(`enum Test {
    VALUE1
    VALUE2
}`);
            expect(changedProject.sources[1].name).to.equal('.i18n.baseline.yaml');
            const expectedTranslationFileDoc = parseDocument(`i18n:
    de:
        types:
            Test:
                values:
                    # Leading comment
                    VALUE2: Wert 2 # Trailing comment
    en:
        types:
            Test:
                values:
                    # Leading comment
                    VALUE2: Value 2 # Trailing comment`);
            expect(changedProject.sources[1].body).to.equal(expectedTranslationFileDoc.toString());
        });
    });
});
