import { gql } from 'graphql-tag';
import { describe, it } from 'vitest';
import {
    expectQuickFix,
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils.js';
import { runCheck } from './utils.js';

describe('checkModel', () => {
    describe('field type', () => {
        it('accepts a correct type', () => {
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

        it('rejects if a field has the wrong type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" needs to be of type "String".',
            );
            expectQuickFix(
                result,
                'Change type to "String"',
                `type Test @rootEntity {
    field: String
}`,
            );
        });

        it('rejects if a field should be a list', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: [String] @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(result, 'Field "Test.field" needs to be a list.');
            expectQuickFix(
                result,
                'Change type to "[String]"',
                `type Test @rootEntity {
    field: [String]
}`,
            );
        });

        it('rejects if a field wrongly is a list', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: [String]
                    }
                `,
            );
            expectSingleCompatibilityIssue(result, 'Field "Test.field" should not be a list.');
            expectQuickFix(
                result,
                'Change type to "String"',
                `type Test @rootEntity {
    field: String
}`,
            );
        });
    });
});
