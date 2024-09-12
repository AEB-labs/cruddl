import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@calcMutations', () => {
        it('rejects a missing @calcMutations with one operator', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int @calcMutations(operators: ADD)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.test" should be decorated with @calcMutations(operators: [ADD]).',
            );
        });

        it('rejects a missing @calcMutations with two operators', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.test" should be decorated with @calcMutations(operators: [ADD, MULTIPLY]).',
            );
        });

        it('rejects one missing operator', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int @calcMutations(operators: ADD)
                    }
                `,
            );
            expectSingleCompatibilityIssue(result, 'Operator MULTIPLY is missing.');
        });

        it('rejects three missing operators', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY, SUBTRACT, DIVIDE])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int @calcMutations(operators: MULTIPLY)
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Operators ADD, SUBTRACT and DIVIDE are missing.',
            );
        });

        it('accepts an exactly equal @calcMutations', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY])
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts @calcMutations with additional operators', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY, SUBTRACT])
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts superfluous @calcMutations', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Int @calcMutations(operators: [ADD, MULTIPLY, SUBTRACT])
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
