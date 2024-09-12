import gql from 'graphql-tag';
import {
    expectQuickFix,
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';
import { Project, ProjectSource } from '../../../core-exports';
import { prettyPrint } from '../../../src/graphql/pretty-print';

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
});
