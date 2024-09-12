import gql from 'graphql-tag';
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
});
