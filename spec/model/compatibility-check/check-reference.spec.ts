import { expect } from 'chai';
import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@reference', () => {
        it('rejects a missing @reference', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Test @reference(keyField: "keyField")
                        key: String @key
                        keyField: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Test @relation
                        key: String @key
                        keyField: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Test.field" should be decorated with @reference(keyField: "keyField") (required by module "module1").',
                'Field "Test.field" should not be a relation (required by module "module1").',
            ]);
        });

        // superfluous reference is tested as missing relation below

        it('rejects a missing @reference(keyField)', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        key: String @key @modules(all: true)
                        keyField: String @modules(all: true)
                        field: Test @reference(keyField: "keyField") @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        key: String @key
                        keyField: String
                        field: Test @reference
                    }
                `,
                { allowWarningsAndInfosInProjectToCheck: true },
            );
            expectSingleCompatibilityIssue(
                result,
                'Reference should declare keyField: "keyField" (required by module "module1").',
            );
        });

        it('rejects a superfluous @reference(keyField)', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        key: String @key @modules(all: true)
                        field: Test @reference @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        key: String @key
                        keyField: String
                        field: Test @reference(keyField: "keyField")
                    }
                `,
                { allowWarningsAndInfosInBaselineProject: true },
            );
            expectSingleCompatibilityIssue(
                result,
                'Reference should not declare a keyField (required by module "module1").',
            );
        });

        it('rejects a wrong @reference(keyField)', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        key: String @key @modules(all: true)
                        keyField: String @modules(all: true)
                        keyField2: String @modules(all: true)
                        field: Test @reference(keyField: "keyField") @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        key: String @key
                        keyField: String
                        keyField2: String
                        field: Test @reference(keyField: "keyField2")
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Reference should declare keyField: "keyField" (required by module "module1").',
            );
        });

        it('accepts a proper @reference without keyField', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        key: String @key @modules(all: true)
                        field: Test @reference @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        key: String @key
                        field: Test @reference
                    }
                `,
                {
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectToBeValid(result);
        });

        it('accepts a proper @reference with keyField', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        key: String @key @modules(all: true)
                        keyField: String @modules(all: true)
                        field: Test @reference(keyField: "keyField") @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        key: String @key
                        keyField: String
                        field: Test @reference(keyField: "keyField")
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
