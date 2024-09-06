import { DocumentNode, print } from 'graphql';
import gql from 'graphql-tag';
import { ValidationResult } from '../../../src/model/validation/result';
import { Project } from '../../../src/project/project';
import { ProjectSource } from '../../../src/project/source';
import {
    expectNoErrors,
    expectSingleCompatibilityIssue,
    expectToBeValid,
} from '../implementation/validation-utils';
import { expect } from 'chai';
import { runCheck } from './utils';

describe('checkModel', () => {
    describe('@root and @parent', () => {
        it('rejects a missing @root', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        childrden: [Child]
                    }

                    type Child @childEntity @modules(in: "module1", includeAllFields: true) {
                        root: Test @root
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity {
                        root: Test @reference(keyField: "field")
                        field: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Child.root" should not be a reference (required by module "module1").',
                'Field "Child.root" should be decorated with @root (required by module "module1").',
            ]);
        });

        it('rejects a superfluous @root', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity @modules(in: "module1", includeAllFields: true) {
                        root: Test @reference(keyField: "field")
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity {
                        root: Test @root
                        field: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Child.root" should be decorated with @reference(keyField: "field") (required by module "module1").',
                'Field "Child.root" should not be decorated with @root (required by module "module1").',
            ]);
        });

        it('accepts a correct @root', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity @modules(in: "module1", includeAllFields: true) {
                        root: Test @root
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity {
                        root: Test @root
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects a missing @parent', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        childrden: [Child]
                    }

                    type Child @childEntity @modules(in: "module1", includeAllFields: true) {
                        parent: Test @parent
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity {
                        parent: Test @reference(keyField: "field")
                        field: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Child.parent" should not be a reference (required by module "module1").',
                'Field "Child.parent" should be decorated with @parent (required by module "module1").',
            ]);
        });

        it('rejects a superfluous @parent', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity @modules(in: "module1", includeAllFields: true) {
                        parent: Test @reference(keyField: "field")
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity {
                        parent: Test @parent
                        field: String
                    }
                `,
            );
            expect(result.messages.length).to.equal(2);
            expect(result.getCompatibilityIssues().map((m) => m.message)).to.deep.equal([
                'Field "Child.parent" should be decorated with @reference(keyField: "field") (required by module "module1").',
                'Field "Child.parent" should not be decorated with @parent (required by module "module1").',
            ]);
        });

        it('accepts a correct @parent', () => {
            const result = runCheck(
                gql`
                    type Test @rootEntity @modules(in: "module1", includeAllFields: true) {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity @modules(in: "module1", includeAllFields: true) {
                        parent: Test @parent
                        field: String
                    }
                `,
                gql`
                    type Test @rootEntity {
                        childrden: [Child]
                        key: String @key
                    }

                    type Child @childEntity {
                        parent: Test @parent
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });
    });
});
