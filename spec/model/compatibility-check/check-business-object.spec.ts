import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@businessObject', () => {
        it('rejects if a type should be a business object', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @businessObject @modules(in: "module1") {
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
                'Type "Test" needs to be decorated with @businessObject (required by module "module1").',
            );
        });

        it('accepts a correct @businessObject', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @businessObject @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity @businessObject {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts an additional @businessObject', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity @businessObject {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
