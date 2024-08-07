import { expect } from 'chai';
import gql from 'graphql-tag';
import {
    expectSingleCompatibilityIssue,
    expectToBeValid
} from '../implementation/validation-utils';
import { runCheck } from './utils';

describe('checkModel', () => {
    
    describe('@relation', () => {
        it('rejects a missing @relation', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        field: Test @relation
                        key: String @key
                        keyField: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        # specifying a reference because just omitting @relation would be an error
                        field: Test @reference(keyField: "keyField")
                        key: String @key
                        keyField: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Test.field" should not be a reference (required by module "module1").',
                'Field "Test.field" should be decorated with @relation (required by module "module1").',
            ]);
        });

        // superfluous relation is tested as missing reference above

        it('rejects a missing @relation that has an inverseOf', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        forwards: Test @relation
                        backwards: Test @relation(inverseOf: "forwards")
                    }
                `,
                gql`
                    type Test @rootEntity {
                        forwards: Test @relation

                        # specifying a reference because just omitting @relation would be an error
                        backwards: Test @reference(keyField: "keyField")
                        key: String @key
                        keyField: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Test.backwards" should not be a reference (required by module "module1").',
                'Field "Test.backwards" should be decorated with @relation(inverseOf: "forwards") (required by module "module1").',
            ]);
        });

        // no test for missing relation with inverseOf + onDelete because that's not supported by @relation

        it('rejects a superfluous and a missing inverseOf argument', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        forwards: Test @relation
                        backwards: Test @relation(inverseOf: "forwards")
                    }
                `,
                gql`
                    type Test @rootEntity {
                        forwards: Test @relation(inverseOf: "backwards")
                        backwards: Test @relation
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Relation "forwards" should be a forward relation, not an inverse relation (required by module "module1").',
                'Relation "backwards" should be an inverse relation with inverseOf: "forwards" (required by module "module1").',
            ]);
        });

        it('rejects a wrong inverseOf argument', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        forwards: Test @relation
                        backwards: Test @relation(inverseOf: "forwards")
                        other: Test @relation
                    }
                `,
                gql`
                    type Test @rootEntity {
                        forwards: Test @relation
                        backwards: Test @relation(inverseOf: "other")
                        other: Test @relation
                    }
                `,
                {
                    // This field and "Test.other" define separate relations
                    allowWarningsAndInfosInBaselineProject: true,
                    allowWarningsAndInfosInProjectToCheck: true,
                },
            );
            expectSingleCompatibilityIssue(
                result,
                'Relation "backwards" should be an inverse relation with inverseOf: "forwards" (required by module "module1").',
            );
        });

        it('rejects a missing onCascade argument', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Test @relation(onDelete: RESTRICT)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Test @relation
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Relation "test" should specify onDelete: RESTRICT (required by module "module1").',
            );
        });

        it('rejects a wrong onCascade argument', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        test: Test @relation
                    }
                `,
                gql`
                    type Test @rootEntity {
                        test: Test @relation(onDelete: RESTRICT)
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Relation "test" should omit the "onDelete" argument (required by module "module1").',
            );
        });

        it('accepts a proper @relation without inverseOf', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        forwards: Test @relation
                    }
                `,
                gql`
                    type Test @rootEntity {
                        forwards: Test @relation
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts a proper @relation with inverseOf', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        forwards: Test @relation
                        backwards: Test @relation(inverseOf: "forwards")
                    }
                `,
                gql`
                    type Test @rootEntity {
                        forwards: Test @relation
                        backwards: Test @relation(inverseOf: "forwards")
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts a proper @relation with onDelete=RESTRICT', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        forwards: Test @relation(onDelete: RESTRICT)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        forwards: Test @relation(onDelete: RESTRICT)
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
