import gql from 'graphql-tag';
import { expectSingleCompatibilityIssue } from '../implementation/validation-utils';
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
        });
    });
});
