import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid
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
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type WrongTypeName @rootEntity {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" is missing (required by module "module1").',
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
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" needs to be a root entity type (required by module "module1").',
            );
        });
    });
});
