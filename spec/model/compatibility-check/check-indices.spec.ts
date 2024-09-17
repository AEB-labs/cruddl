import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('indices', () => {
        it('accepts if there are no indices', () => {
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

        it('accepts if there are indices but there do not need to be any', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(indices: [{ fields: ["field"] }]) {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts if an index is required and present', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"] }])
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(indices: [{ fields: ["field"] }]) {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts if an index is required and present with unique and sparse explicitly set to their default values', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"] }])
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test
                        @rootEntity(
                            indices: [{ fields: ["field"], unique: false, sparse: false }]
                        ) {
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if an index is required and no index is present', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"] }])
                        @modules(in: "module1") {
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
                'The following index is missing: {fields: ["field"]}',
            );
        });

        it('rejects if an index is required, but it only exists with a different field', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"], unique: true }])
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(indices: [{ fields: ["field2"] }]) {
                        field: String
                        field2: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'The following index is missing: {fields: ["field"], unique: true}',
            );
        });

        it('rejects if an index is required, but it only exists with an additional field', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"], unique: true }])
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(indices: [{ fields: ["field", "field2"] }]) {
                        field: String
                        field2: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'The following index is missing: {fields: ["field"], unique: true}',
            );
        });

        it('rejects if an index is required, but it only exists with a different unique value', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"], unique: true }])
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity(indices: [{ fields: ["field"] }]) {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'The following index is missing: {fields: ["field"], unique: true}',
            );
        });

        it('rejects if an index is required, but it only exists with a different sparse value', () => {
            const result = runCheck(
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"], unique: true }])
                        @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test
                        @rootEntity(indices: [{ fields: ["field"], unique: true, sparse: false }]) {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'The following index is missing: {fields: ["field"], unique: true}',
            );
        });
    });

    it('accepts if multiple indices are required and present', () => {
        const result = runCheck(
            gql`
                type Test
                    @rootEntity(
                        indices: [
                            { fields: ["field1"] }
                            { fields: ["field2", "field3"], unique: true }
                            { fields: ["field3"], sparse: true }
                        ]
                    )
                    @modules(in: "module1") {
                    field1: String @modules(all: true)
                    field2: String @modules(all: true)
                    field3: String @modules(all: true)
                }
            `,
            gql`
                type Test
                    @rootEntity(
                        indices: [
                            { fields: ["field1"] }
                            { fields: ["field2", "field3"], unique: true }
                            { fields: ["field3"], sparse: true }
                        ]
                    ) {
                    field1: String
                    field2: String
                    field3: String
                }
            `,
        );
        expectToBeValid(result);
    });

    it('rejects if multiple indices are required but not all are present', () => {
        const result = runCheck(
            gql`
                type Test
                    @rootEntity(
                        indices: [
                            { fields: ["field1"] }
                            { fields: ["field2", "field3"], unique: true }
                            { fields: ["field3"], sparse: true }
                        ]
                    )
                    @modules(in: "module1") {
                    field1: String @modules(all: true)
                    field2: String @modules(all: true)
                    field3: String @modules(all: true)
                }
            `,
            gql`
                type Test @rootEntity(indices: [{ fields: ["field1"] }]) {
                    field1: String
                    field2: String
                    field3: String
                }
            `,
        );
        expectSingleCompatibilityIssue(
            result,
            'The following indices are missing: {fields: ["field2", "field3"], unique: true}, {fields: ["field3"], sparse: true}',
        );
    });

    it('rejects if a field should be @unique but is not', () => {
        const result = runCheck(
            gql`
                type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                    field: String @unique
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
            'The following index is missing: {fields: ["field"], unique: true}',
        );
    });
});
