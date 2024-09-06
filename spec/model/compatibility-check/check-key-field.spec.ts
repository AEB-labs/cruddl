import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@key', () => {
        it('rejects if a field needs to be a key field', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @key @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" needs to be decorated with @key (required by module "module1").',
            );
        });
        it('accepts if the field is properly decorated with @key', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @key @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @key
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if the id field needs to be decorated with @key but is missing', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        id: ID @key
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "id: ID @key" needs to be specified (required by module "module1").',
            );
        });

        it('rejects if the id field needs to be decorated with @key', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        id: ID @key
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        id: ID
                        field: String
                    }
                `,
                { allowWarningsAndInfosInProjectToCheck: true },
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.id" needs to be decorated with @key (required by module "module1").',
            );
        });

        it('accepts a field to be decorated with @key even though the module does not', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @key
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts if the id field is properly decorated with @key', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        id: ID @key
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        id: ID @key
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
