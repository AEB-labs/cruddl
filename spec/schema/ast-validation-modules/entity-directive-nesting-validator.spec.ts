import { assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects } from './helpers';

describe('entity directive nesting validator', () => {
    it('accepts field of @rootEntity type as @relation', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity { fooo: String }
            type Bar @rootEntity { foo: Foo @relation }
        `);
    });

    it('accepts field of @rootEntity type as @reference', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity { fooo: String @key } 
            type Bar @rootEntity { foo: Foo @reference }
        `);
    });

    it('accepts list of @rootEntity type as @relation', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity { fooo: String }
            type Bar @rootEntity { foo: [Foo] @relation }
        `);
    });

    it('rejects field of @rootEntity type without @relation or @reference', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity { fooo: String }      
            type Bar @rootEntity { foo: Foo }
        `,
            'Type "Foo" is a root entity type and cannot be embedded. Consider adding @reference or @relation.',
        );
    });

    it('rejects list of @rootEntity type without @relation or @reference', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity { fooo: String }
            type Bar @rootEntity { foo: [Foo] }
        `,
            'Type "Foo" is a root entity type and cannot be embedded. Consider adding @reference or @relation.',
        );
    });

    it('rejects non nullable list of @rootEntity type without @relation or @reference', () => {
        assertValidatorRejects(
            `
            type Foo @rootEntity { fooo: String }
            type Bar @rootEntity { foo: [Foo!]! }
        `,
            'Type "Foo" is a root entity type and cannot be embedded. Consider adding @reference or @relation.',
        );
    });

    it('accepts nesting @valueObjects', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @valueObject { fooo: String }
            type Bar @valueObject { foo: Foo }
            type Root @rootEntity { bar: Bar } # to avoid warning because Bar is not used
        `);
    });

    it('accepts nesting @valueObject lists', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @valueObject { fooo: String }
            type Bar @valueObject { foo: [Foo] }
            type Root @rootEntity { bar: Bar } # to avoid warning because Bar is not used
        `);
    });

    it('accepts nesting non-nullable @valueObject lists', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @valueObject { fooo: String }
            type Bar @valueObject { foo: [Foo!]! }
            type Root @rootEntity { bar: Bar } # to avoid warning because Bar is not used
        `);
    });

    it('rejects nesting an entity into @valueObjects', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity { fooo: String }
            type Bar @valueObject { foo: Foo }
        `,
            'Type "Foo" is a child entity type and cannot be used within value object types. Change "Bar" to an entity extension type or use a value object type for "foo".',
        );
    });

    it('rejects nesting an entity list into @valueObjects', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity { fooo: String }
            type Bar @valueObject { foo: [Foo] }
        `,
            'Type "Foo" is a child entity type and cannot be used within value object types. Change "Bar" to an entity extension type or use a value object type for "foo".',
        );
    });

    it('rejects nesting an non-null entity list into @valueObjects', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity { fooo: String }
            type Bar @valueObject { foo: [Foo!]! }
        `,
            'Type "Foo" is a child entity type and cannot be used within value object types. Change "Bar" to an entity extension type or use a value object type for "foo".',
        );
    });

    it('accepts valueObjects with reference to @rootEntity', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity { fooo: String @key }
            type Bar @valueObject { foo: Foo @reference }
            type Root @rootEntity { bar: Bar } # to avoid warning because Bar is not used
        `);
    });

    it('rejects @childEntity field usage without list', () => {
        assertValidatorRejects(
            `
            type Foo @childEntity { fooo: String }
            type Bar @rootEntity { foo: Foo }
        `,
            'Type "Foo" is a child entity type and can only be used in a list. Change the field type to "[Foo]", or use an entity extension or value object type instead.',
        );
    });
});
