import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

describe('modules validator', () => {
    describe('using decorator without withModuleDefinitions', () => {
        it('does not allow @modules on a type if withModuleDefinitions is false', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String
                    }
                `,
                'Module specifications are not supported in this context.',
            );
        });

        it('does not allow @modules on a field if withModuleDefinitions is false', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity {
                        foo: String @modules(all: true)
                    }
                `,
                'Module specifications are not supported in this context.',
            );
        });
    });

    describe('on enum types', () => {
        it('accepts a simple @modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    enum Foo @modules(in: ["module1", "module2"]) {
                        VALUE1, VALUE2
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('rejects includeAllFields', () => {
            assertValidatorRejects(
                `
                    enum Foo @modules(in: ["module1", "module2"], includeAllFields: true) {
                        VALUE1, VALUE2
                    }
                `,
                'includeAllFields cannot be specified for enum types.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects all: true', () => {
            assertValidatorRejects(
                `
                    enum Foo @modules(in: ["module1"], all: true ) {
                        VALUE1, VALUE2
                    }
                `,
                '"all" can only be specified on field declarations.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects a missing @modules', () => {
            assertValidatorRejects(
                `
                    enum Foo {
                        VALUE1, VALUE2
                    }
                `,
                'Type "Foo" is missing a module specification. Add @modules(in: ...) to specify the modules.',
                { withModuleDefinitions: true },
            );
        });
    });

    describe('on object types', () => {
        it('accepts a simple @modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts @modules(in: "...")', () => {
            // this is allowed by graphql
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: "module1") {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts @modules with an empty module list', () => {
            // allowed so you can temporarily remove all modules for testing purposes
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: []) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('does not allow @modules(all: ...)', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1"], all: true) {
                        foo: String @modules(in: ["module1"])
                    }
                `,
                '"all" can only be specified on field declarations.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects a missing @modules on a root entity type', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity {
                        foo: String @modules(all: true)
                    }
                `,
                'Type "Foo" is missing a module specification. Add @modules(in: ...) to specify the modules.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects a missing @modules on a child entity type', () => {
            assertValidatorRejects(
                `
                    type Bar @childEntity {
                        foo: String
                    }
                `,
                'Type "Bar" is missing a module specification. Add @modules(in: ...) to specify the modules.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects a missing @modules on an entity extension type', () => {
            assertValidatorRejects(
                `
                    type Bar @entityExtension {
                        foo: String
                    }
                `,
                'Type "Bar" is missing a module specification. Add @modules(in: ...) to specify the modules.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects a missing @modules on a value object type', () => {
            assertValidatorRejects(
                `
                    type Bar @valueObject {
                        foo: String
                    }
                `,
                'Type "Bar" is missing a module specification. Add @modules(in: ...) to specify the modules.',
                { withModuleDefinitions: true },
            );
        });
    });

    describe('on fields', () => {
        it('accepts @modules(all: true)', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts @modules(in: ...)', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String @modules(in: ["module1"])
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts @modules with an empty module list', () => {
            // basically means that the field is not available anywhere - can be used for testing
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1"]) {
                        foo: String @modules(in: [])
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts without @modules on the field if includeAllFields is true on the type', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        foo: String
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('rejects @modules with neither all nor in', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String @modules
                    }
                `,
                'Either "all" or "in" needs to be specified.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects @modules with both all and in', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String @modules(all: true, in: ["module1"])
                    }
                `,
                '"all" and "in" cannot be combined.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects missing @modules', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String
                    }
                `,
                'Missing module specification. Either add @modules on field "foo", or specify @modules(includeAllFields: true) on type "Foo".',
                { withModuleDefinitions: true },
            );
        });

        it('rejects @modules on a field if includeAllFields is true on the type', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1"], includeAllFields: true) {
                        foo: String @modules(all: true)
                    }
                `,
                '@modules cannot be specified here because @modules(includeAllFields: true) is specified on type "Foo", and therefore @modules(all: true) is implicitly configured for all its fields.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects @modules on the id field', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1"]) {
                        foo: String @modules(all: true)
                        id: ID @modules(all: true)
                    }
                `,
                'Directive "@modules" is not allowed on system field "id" and will be discarded',
                { withModuleDefinitions: true },
            );
        });

        it('accepts the id field without @modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1"]) {
                        foo: String @modules(all: true)
                        id: ID @key
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('does not allow @modules(includeAllFields: ...)', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1"]) {
                        foo: String @modules(all: true, includeAllFields: true)
                    }
                `,
                '"includeAllFields" can only be specified on type declarations.',
                { withModuleDefinitions: true },
            );
        });
    });

    describe('on key fields', () => {
        it('accepts @modules(includeAllFields: true)', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"], includeAllFields: true) {
                        foo: String @key
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts @modules(all: true)', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2"]) {
                        foo: String @key @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts explicitly listing exactly the modules from the type', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1", "module2 & module3"]) {
                        foo: String @key @modules(in: ["module1", "module2 & module3"])
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('rejects if the key field is restricted more than the type', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1"]) {
                        foo: String @key @modules(in: ["module2"])
                    }
                `,
                'Key fields must always be included in all modules of their declaring type. Set @modules(all: true). (Type "Foo" is included in module "module1", but the key field is not.)',
                { withModuleDefinitions: true },
            );
        });
    });

    describe('expressions', () => {
        it('accepts a single module', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an and combination of two modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1 & module2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an and combination of two modules without space', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1&module2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an expression that starts with spaces', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["    module1"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an expression that ends in a tab', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1 & module2\t"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an expression that ends in a space', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1 & module2 "]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an and combination of two modules with multiple space characters', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1    &\tmodule2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('accepts an and combination of three modules', () => {
            assertValidatorAcceptsAndDoesNotWarn(
                `
                    type Foo @rootEntity @modules(in: ["module1 & module2 & module3"]) {
                        foo: String @modules(all: true)
                    }
                `,
                { withModuleDefinitions: true },
            );
        });

        it('rejects a module that does not exist', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["doesNotExist"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Module "doesNotExist" does not exist.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects an expression with a double &&', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1 && module2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Expected identifier, but got "&".',
                { withModuleDefinitions: true },
            );
        });

        it('rejects an expression with just two identifiers next to each other', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1 module2"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Expected "&", but got "m".',
                { withModuleDefinitions: true },
            );
        });

        it('rejects an expression that ends with &', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1 &"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Expected identifier.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects an expression that ends with &', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1 &"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Expected identifier.',
                { withModuleDefinitions: true },
            );
        });

        it('rejects an expression that starts with &', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["& module1"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Expected identifier, but got "&".',
                { withModuleDefinitions: true },
            );
        });

        it('rejects an expression that includes an invalid character', () => {
            assertValidatorRejects(
                `
                    type Foo @rootEntity @modules(in: ["module1!elf"]) {
                        foo: String @modules(all: true)
                    }
                `,
                'Expected identifier or "&", but got "!".',
                { withModuleDefinitions: true },
            );
        });
    });
});
