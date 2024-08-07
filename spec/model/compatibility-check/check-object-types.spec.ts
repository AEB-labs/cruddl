import gql from 'graphql-tag';
import { expectQuickFix, expectSingleCompatibilityIssue } from '../implementation/validation-utils';
import { runCheck } from './utils';

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
    });
});
