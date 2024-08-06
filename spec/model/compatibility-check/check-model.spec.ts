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

describe('checkModel', () => {
    describe('basics', () => {
        it('accepts a simple case', () => {
            const result = run(
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

        it('rejects if a type is missing', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type WrongTypeName @rootEntity {
                        field: String
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" is missing (required by module "module1").',
            );
        });

        it('rejects if a type is of a completely wrong kind', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    enum Test {
                        VALUE1
                        VALUE2
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Type "Test" needs to be a root entity type (required by module "module1").',
            );
        });
    });

    describe('@businessObject', () => {
        it('rejects if a type should be a business object', () => {
            const result = run(
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
            const result = run(
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
            const result = run(
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

    describe('enums', () => {
        it('rejects if an enum value is missing', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Enum value "VALUE2" is missing (required by module "module1").',
            );
        });

        it('accepts an additional enum value', () => {
            const result = run(
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

    describe('object types', () => {
        it('rejects if a field is missing', () => {
            const result = run(
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

        it('rejects if a field has the wrong type', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: Int
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" needs to be of type "String" (required by module "module1").',
            );
        });

        it('rejects if a field should be a list', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: [String] @modules(all: true)
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
                'Field "Test.field" needs to be a list (required by module "module1").',
            );
        });

        it('rejects if a field wrongly is a list', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: [String]
                    }
                `,
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.field" should not be a list (required by module "module1").',
            );
        });
    });

    describe('@key', () => {
        it('rejects if a field needs to be a key field', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @key @modules(all: true)
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
                'Field "Test.field" needs to be decorated with @key (required by module "module1").',
            );
        });
        it('accepts if the field is properly decorated with @key', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @key @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @key
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('rejects if the id field needs to be decorated with @key but is missing', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        id: ID @key
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
                'Field "id: ID @key" needs to be specified (required by module "module1").',
            );
        });

        it('rejects if the id field needs to be decorated with @key', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        id: ID @key
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        id: ID
                        field: String
                    }
                `,
                { allowWarningsAndInfosInProjectToCheck: true },
            );
            expectSingleCompatibilityIssue(
                result,
                'Field "Test.id" needs to be decorated with @key (required by module "module1").',
            );
        });

        it('accepts a field to be decorated with @key even though the module does not', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        field: String @key
                    }
                `,
            );
            expectToBeValid(result);
        });

        it('accepts if the id field is properly decorated with @key', () => {
            const result = run(
                gql`
                    type Test @rootEntity @modules(in: "module1") {
                        id: ID @key
                        field: String @modules(all: true)
                    }
                `,
                gql`
                    type Test @rootEntity {
                        id: ID @key
                        field: String
                    }
                `,
            );
            expectToBeValid(result);
        });
    });

    describe('@reference', () => {
        it('rejects a missing @reference', () => {
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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

    describe('@relation', () => {
        it('rejects a missing @relation', () => {
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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

    describe('@collect', () => {
        it('rejects a superfluous @collect', () => {
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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

    describe('@defaultValue', () => {
        it('rejects a superfluous @defaultValue', () => {
            const result = run(
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
                'Field "Test.field" should not have a default value (required by module "module1").',
            );
        });

        it('rejects a missing @defaultValue', () => {
            const result = run(
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
                'Field "Test.field" should be decorated with @defaultValue(value: "hello") (required by module "module1").',
            );
        });

        it('rejects a wrong @defaultValue with a String type', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Default value should be "correct" (required by module "module1").',
            );
        });

        it('rejects a wrong @defaultValue with an Int type', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Default value should be 42 (required by module "module1").',
            );
        });

        it('rejects a wrong @defaultValue with a Float type', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Default value should be 6.28 (required by module "module1").',
            );
        });

        it('rejects a wrong @defaultValue with an [Int] type', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Default value should be [1, 2, 3] (required by module "module1").',
            );
        });

        it('rejects a wrong @defaultValue with a value object type', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Default value should be {a: true, b: false} (required by module "module1").',
            );
        });

        it('accepts a correct @defaultValue with a String type', () => {
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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
            const result = run(
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

    describe('@calcMutations', () => {
        it('rejects a missing @calcMutations with one operator', () => {
            const result = run(
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
                'Field "Test.test" should be decorated with @calcMutations(operators: [ADD]) (required by module "module1").',
            );
        });

        it('rejects a missing @calcMutations with two operators', () => {
            const result = run(
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
                'Field "Test.test" should be decorated with @calcMutations(operators: [ADD, MULTIPLY]) (required by module "module1").',
            );
        });

        it('rejects one missing operator', () => {
            const result = run(
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
            expectSingleCompatibilityIssue(
                result,
                'Operator MULTIPLY is missing (required by module "module1").',
            );
        });

        it('rejects three missing operators', () => {
            const result = run(
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
                'Operators ADD, SUBTRACT and DIVIDE are missing (required by module "module1").',
            );
        });

        it('accepts an exactly equal @calcMutations', () => {
            const result = run(
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
            const result = run(
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
            const result = run(
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

interface RunOptions {
    allowWarningsAndInfosInProjectToCheck?: boolean;
    allowWarningsAndInfosInBaselineProject?: boolean;
}

function run(
    baselineDoc: DocumentNode,
    docToCheck: DocumentNode,
    options: RunOptions = {},
): ValidationResult {
    const projectToCheck = new Project({
        sources: [new ProjectSource('to-check.graphql', print(docToCheck))],
    });
    if (options.allowWarningsAndInfosInProjectToCheck) {
        expectNoErrors(projectToCheck);
    } else {
        expectToBeValid(projectToCheck);
    }

    const projectWithModules = new Project({
        sources: [
            new ProjectSource('baseline.graphql', print(baselineDoc)),
            new ProjectSource(
                'modules.json',
                JSON.stringify({ modules: ['module1', 'module2', 'module3', 'extra1', 'extra2'] }),
            ),
        ],
        modelOptions: { withModuleDefinitions: true },
    });
    if (options.allowWarningsAndInfosInBaselineProject) {
        expectNoErrors(projectWithModules);
    } else {
        expectToBeValid(projectWithModules);
    }

    // while we could test the compatibility check without modules, including this in the test allows us
    // to ensure that all messages have the required-by-modules suffix.
    const baselineProject = projectWithModules.withModuleSelection(['module1']);
    const baselineValidationResult = baselineProject.validate();
    if (baselineValidationResult.hasErrors()) {
        throw new Error(
            `withModuleSelection created a project with validation errors. Project:\n${baselineProject.sources
                .map((s) => s.body)
                .join('\n----\n')}\n\nProblems:\n${baselineValidationResult.toString()}`,
        );
    }

    return projectToCheck.checkCompatibility(baselineProject);
}
