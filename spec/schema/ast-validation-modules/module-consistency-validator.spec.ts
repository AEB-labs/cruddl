import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
} from './helpers';
import gql from 'graphql-tag';

describe('module consistency validator', () => {
    describe('consistency check for field types', () => {
        it('allows a builtin type', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows a type that is included in the single module', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other
                    }

                    type Other @entityExtension @modules(in: ["module1"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows a type that is included in a combination of two modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test
                        @rootEntity
                        @modules(in: ["module1 & module2"], includeAllFields: true) {
                        field: Other
                    }

                    type Other
                        @entityExtension
                        @modules(in: ["module1 & module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows a type that is included in a combination of two modules via separate field + type directives', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"]) {
                        field: Other @modules(in: ["module2"])
                    }

                    type Other
                        @entityExtension
                        @modules(in: ["module1 & module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows a type that is included in two modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test
                        @rootEntity
                        @modules(in: ["module1", "module2"], includeAllFields: true) {
                        field: Other
                    }

                    type Other
                        @entityExtension
                        @modules(in: ["module1", "module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows a type that is included in two modules when the field is in one of the modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other
                    }

                    type Other
                        @entityExtension
                        @modules(in: ["module1", "module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows a type that is included in a module when the field is included in a combination', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test
                        @rootEntity
                        @modules(in: ["module1 & module2"], includeAllFields: true) {
                        field: Other
                    }

                    type Other @entityExtension @modules(in: ["module1"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('disallows a type that is not included in the single module', () => {
            assertValidatorRejects(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other
                    }

                    type Other @entityExtension @modules(in: ["module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                'Field "field" is included in module "module1", but its type "Other" is not.',
                { withModuleDefinitions: true },
            );
        });

        it('disallows a type that is not included in a combination of two modules', () => {
            assertValidatorRejects(
                gql`
                    type Test
                        @rootEntity
                        @modules(in: ["module1 & module2"], includeAllFields: true) {
                        field: Other
                    }

                    type Other @entityExtension @modules(in: ["module3"], includeAllFields: true) {
                        field: String
                    }
                `,
                'Field "field" is included in the combination of module "module1" and "module2", but its type "Other" is not.',
                { withModuleDefinitions: true },
            );
        });

        it('disallows a type that is only included in a combination of the module and a different one', () => {
            assertValidatorRejects(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other
                    }

                    type Other
                        @entityExtension
                        @modules(in: ["module1 & module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                'Field "field" is included in module "module1", but its type "Other" is not.',
                { withModuleDefinitions: true },
            );
        });

        it('disallows a more complex case', () => {
            assertValidatorRejects(
                gql`
                    type Test
                        @rootEntity
                        @modules(in: ["module1", "module2 & module3"], includeAllFields: true) {
                        field: Other
                    }

                    type Other
                        @entityExtension
                        @modules(
                            in: ["module1 & module2", "module1 & module3"]
                            includeAllFields: true
                        ) {
                        field: String
                    }
                `,
                'Field "field" is included in module "module1", and in the combination of module "module2" and "module3", but its type "Other" is not.',
                { withModuleDefinitions: true },
            );
        });
    });

    describe('consistency check for collect paths', () => {
        it('allows a traversed field that is included in the single module', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        source: [Other]
                        field: [String] @collect(path: "source.field", aggregate: DISTINCT)
                    }

                    type Other @valueObject @modules(in: ["module1"], includeAllFields: true) {
                        field: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('disallows a traversed field at segment 1 that is not included in the single module', () => {
            assertValidatorRejects(
                gql`
                    type Test @rootEntity @modules(in: ["module1"]) {
                        source: [Other] @modules(in: ["module2"])
                        field: [String]
                            @collect(path: "source.field", aggregate: DISTINCT)
                            @modules(all: true)
                    }

                    type Other @valueObject @modules(in: ["module2"], includeAllFields: true) {
                        field: String
                    }
                `,
                'Field "field" is included in module "module1", but the field "Test.source" used in the collect path is not.',
                { withModuleDefinitions: true },
            );
        });

        it('disallows a traversed field at segment 2 that is not included in the single module', () => {
            assertValidatorRejects(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        source: [Other]
                        field: [String] @collect(path: "source.field", aggregate: DISTINCT)
                    }

                    type Other @valueObject @modules(in: ["module1"]) {
                        field: String @modules(in: ["module2"])
                    }
                `,
                'Field "field" is included in module "module1", but the field "Other.field" used in the collect path is not.',
                { withModuleDefinitions: true },
            );
        });
    });

    describe('consistency check for relations', () => {
        it('allows an inverseOf field that is included in the single module', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other @relation(inverseOf: "inverse")
                    }

                    type Other @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        inverse: Test @relation
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('disallows an inverseOf field that is not included in the single module', () => {
            assertValidatorRejects(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other @relation(inverseOf: "inverse")
                    }

                    type Other @rootEntity @modules(in: ["module1"]) {
                        inverse: Test @relation @modules(in: ["module2"])
                    }
                `,
                'Field "field" is included in module "module1", but the inverse relation field "Other.inverse" is not.',
                { withModuleDefinitions: true },
            );
        });

        it('allows an inverse (not inverseOf) field that is not included in the single module', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        field: Other @relation
                    }

                    type Other @rootEntity @modules(in: ["module1"]) {
                        inverse: Test @relation(inverseOf: "field") @modules(in: ["module2"])
                    }
                `,
                { withModuleDefinitions: true },
            );
        });
    });

    describe('consistency check for references', () => {
        it('allows a keyField field that is included in the single module', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                gql`
                    type Test @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        value: String
                        ref: Other @reference(keyField: "value")
                    }

                    type Other @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        key: String @key
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('allows @reference without keyField', () => {
            assertValidatorWarns(
                gql`
                    type Test @rootEntity @modules(in: ["module1"]) {
                        ref: Other @reference @modules(in: ["module2"])
                    }

                    type Other @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        key: String @key
                    }
                `,
                'Usage of @reference without the keyField argument is deprecated. Add a field of type "String" and specify it in @reference(keyField: "...")',
                { withModuleDefinitions: true },
            );
        });

        it('disallows a keyField field that is not included in the single module', () => {
            assertValidatorRejects(
                gql`
                    type Test @rootEntity @modules(in: ["module1"]) {
                        value: String @modules(in: ["module2"])
                        ref: Other @reference(keyField: "value") @modules(in: ["module1"])
                    }

                    type Other @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        key: String @key
                    }
                `,
                'Field "ref" is included in module "module1", but the reference key field "value" is not.',
                { withModuleDefinitions: true },
            );
        });
    });
});
