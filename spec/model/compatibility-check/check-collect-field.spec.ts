import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@collect', () => {
        it('rejects a superfluous @collect', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        items2: [Item]
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        items2: [Item] @collect(path: "items")
                    }

                    type Item @childEntity {
                        value: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.items2" should not be a collect field (required by module "module1").',
            );
        });

        it('rejects a missing @collect', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        items2: [Item] @collect(path: "items")
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        items2: [Item]
                    }

                    type Item @childEntity {
                        value: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.items2" should be decorated with @collect(path: "items") (required by module "module1").',
            );
        });

        it('rejects a missing @collect that has an aggregate operator', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        sum: Int @collect(path: "items.value", aggregate: SUM)
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        sum: Int
                    }

                    type Item @childEntity {
                        value: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.sum" should be decorated with @collect(path: "items.value", aggregate: SUM) (required by module "module1").',
            );
        });

        it('rejects a wrong path', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        values: [Int] @collect(path: "items.value1", aggregate: DISTINCT)
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value1: Int
                        value2: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        values: [Int] @collect(path: "items.value2", aggregate: DISTINCT)
                    }

                    type Item @childEntity {
                        value1: Int
                        value2: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Path should be "items.value1" (required by module "module1").',
            );
        });

        it('rejects a wrong aggregate argument', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        test: Int @collect(path: "items.value", aggregate: COUNT_NULL)
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        test: Int @collect(path: "items.value", aggregate: COUNT_NOT_NULL)
                    }

                    type Item @childEntity {
                        value: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Collect field should specify aggregate: COUNT_NULL (required by module "module1").',
            );
        });

        // currently no test for superfluous or missing aggregate argument because there are no
        // cases that are valid with and without an aggregate
        // (to be proven wrong)

        it('accepts a proper collect without aggregate', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        items2: [Item] @collect(path: "items")
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        items2: [Item] @collect(path: "items")
                    }

                    type Item @childEntity {
                        value: Int
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts a proper collect with aggregate', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        items: [Item]
                        sum: Int @collect(path: "items.value", aggregate: SUM)
                    }

                    type Item @childEntity @modules(in: "module1", includeAllFields: true) {
                        value: Int
                    }
                `,
                gql`
                    type Test @rootEntity {
                        items: [Item]
                        sum: Int @collect(path: "items.value", aggregate: SUM)
                    }

                    type Item @childEntity {
                        value: Int
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
