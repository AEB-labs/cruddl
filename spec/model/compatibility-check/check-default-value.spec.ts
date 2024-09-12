import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@defaultValue', () => {
        it('rejects a superfluous @defaultValue', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @defaultValue(value: "hello")
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" should not have a default value.',
            );
        });

        it('rejects a missing @defaultValue', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: String @defaultValue(value: "hello")
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" should be decorated with @defaultValue(value: "hello").',
            );
        });

        it('rejects a wrong @defaultValue with a String type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: String @defaultValue(value: "correct")
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @defaultValue(value: "wrong")
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(result, 'Default value should be "correct".');
        });

        it('rejects a wrong @defaultValue with an Int type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Int @defaultValue(value: 42)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Int @defaultValue(value: 24)
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(result, 'Default value should be 42.');
        });

        it('rejects a wrong @defaultValue with a Float type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Float @defaultValue(value: 6.28)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Float @defaultValue(value: 3.14)
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(result, 'Default value should be 6.28.');
        });

        it('rejects a wrong @defaultValue with an [Int] type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: [Int] @defaultValue(value: [1, 2, 3])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: [Int] @defaultValue(value: [1, 2])
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(result, 'Default value should be [1, 2, 3].');
        });

        it('rejects a wrong @defaultValue with a value object type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Inner @defaultValue(value: { a: true, b: false })
                    }

                    type Inner @valueObject @modules(in: "module1", includeAllFields: true) {
                        a: Boolean
                        b: Boolean
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Inner @defaultValue(value: { a: true, b: true })
                    }

                    type Inner @valueObject {
                        a: Boolean
                        b: Boolean
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(result, 'Default value should be {a: true, b: false}.');
        });

        it('accepts a correct @defaultValue with a String type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: String @defaultValue(value: "correct")
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @defaultValue(value: "correct")
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectToBeValid(result);
        });

        it('accepts a correct @defaultValue with an Int type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Int @defaultValue(value: 42)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Int @defaultValue(value: 42)
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectToBeValid(result);
        });

        it('accepts a correct @defaultValue with a Float type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Float @defaultValue(value: 6.28)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Float @defaultValue(value: 6.28)
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectToBeValid(result);
        });

        it('accepts a correct @defaultValue with an [Int] type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: [Int] @defaultValue(value: [1, 2, 3])
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: [Int] @defaultValue(value: [1, 2, 3])
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectToBeValid(result);
        });

        it('accepts a correct @defaultValue with a value object type', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Inner @defaultValue(value: { a: true, b: false })
                    }

                    type Inner @valueObject @modules(in: "module1", includeAllFields: true) {
                        a: Boolean
                        b: Boolean
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Inner @defaultValue(value: { a: true, b: false })
                    }

                    type Inner @valueObject {
                        a: Boolean
                        b: Boolean
                    }
                `,
                {
                    // Take care, there are no type checks for default values yet.
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectToBeValid(result);
        });
    });
});
