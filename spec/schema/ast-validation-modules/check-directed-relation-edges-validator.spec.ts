import { assertValidatorAccepts, assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects, assertValidatorWarns } from './helpers';

describe('check-directed-relation-edges-validator', () => {

    it('accepts forward only @relation', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity { bar: Bar @relation }
            type Bar @rootEntity { bla: String }
        `);
    });

    it('accepts bidirectional relation @relation', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity { bar: Bar @relation }
            type Bar @rootEntity { foo: Foo @relation(inverseOf: "bar") }
        `);
    });

    it('accepts two forward only @relations', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity { bar: Bar @relation, bar2: Bar @relation }
            type Bar @rootEntity { bla: String }
        `);
    });

    it('accepts two bidirectional @relations', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity { bar: Bar @relation, bar2: Bar @relation }
            type Bar @rootEntity { foo: Foo @relation(inverseOf:"bar"), foo2: Foo @relation(inverseOf:"bar2") }
        `);
    });

    it('accepts one bidirectional and one forward only @relation', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity { bar: Bar @relation, bar2: Bar @relation }
            type Bar @rootEntity { foo: Foo @relation(inverseOf:"bar") }
        `);
    });

    it('accepts backward only @relations', () => {
        assertValidatorRejects(`
            type Foo @rootEntity { bar: Bar @relation(inverseOf: "foo") }
            type Bar @rootEntity { bla: String }
        `, 'Field "foo" does not exist on type "Bar".');
    });

    it('warns screwed @relations', () => {
        assertValidatorWarns(`
            type Foo @rootEntity { bar: Bar @relation }
            type Bar @rootEntity { foo: Foo @relation }
        `, 'This field and "Bar.foo" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation.');
    });

    it('accepts self-relation with backlink', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity { children: [Foo] @relation, parent: Foo @relation(inverseOf: "children") }
        `);
    });

    it('accepts self-relation without backlink', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Foo @rootEntity { children: [Foo] @relation }
        `);
    });

    // value checker rule is currently disabled (TODO re-enable when graphqljs 0.13 is used)
    /*it('rejects inverseOf with bad type', () => {
        assertValidatorRejects(`
            type Foo @rootEntity { bar: Bar @relation }
            type Bar @rootEntity { foo: Foo @relation(inverseOf:5) }
        `, 'This field and "Bar.foo" define separate relations. Consider using the "inverseOf" argument to add a backlink to an existing relation.');
    });

    it('rejects @relation with bad remote type', () => {
        assertValidatorRejects(`
            type Foo @rootEntity { bar: Bar @relation }
            type Bar @rootEntity { foo: XXX @relation(inverseOf:bar) }
            type XXX @rootEntity { id: String }
        `, 'VALIDATION_ERROR_INVALID_ARGUMENT_TYPE');
    });*/

});
