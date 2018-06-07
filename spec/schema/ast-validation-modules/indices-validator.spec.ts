import { assertValidatorAccepts, assertValidatorRejects } from './helpers';

describe('indices validator', () => {

    it('accepts flawless index', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity(indices:[{ fields: ["foo" ]}]) { foo: String }
        `);
    });

    it('accepts index on enum type', () => {
        assertValidatorAccepts(`
            enum Animal { Cat, Dog }
            type Foo @rootEntity(indices:[{ fields: ["animal" ]}]) { animal: Animal }
        `);
    });

    it('accepts index on multiple columns', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity(indices:[{ fields: ["foo", "bar" ]}]) { foo: String, bar: String }
        `);
    });

    it('accepts index on nested field', () => {
        assertValidatorAccepts(`
            type Foo @rootEntity(indices:[{ fields: ["bar.baz" ]}]) { foo: String, bar: Bar }
            type Bar @entityExtension { baz: String }
        `);
    });

    it('rejects index with empty fields list', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: []}]) { foo: String }
        `, 'An index must specify at least one field.');
    });

    it('rejects index with bad fields syntax', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: ["asds#/asd"]}]) { foo: String }
        `, 'An index field path should be field names separated by dots.');
    });

    it('rejects index with unknown field in path', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String }
        `, 'Type "Foo" does not have a field "bar"');
    });

    it('rejects index on missing nested field', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: ["bar.bla"]}]) { foo: String, bar: Bar }
            type Bar @entityExtension { baz: String }
        `, 'Type "Bar" does not have a field "bla"');
    });

    it('rejects index on non-scalar field', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: ["bar"]}]) { foo: String, bar: Bar }
            type Bar @entityExtension { baz: String }
        `, 'Indices can only be defined on scalar or enum fields, but the type of "Foo.bar" is an object type. Specify a dot-separated field path to create an index on an embedded object.');
    });

    it('rejects index with sub-path in scalar', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: ["bar.baz"]}]) { foo: String, bar: String }
        `, 'Field "bar" is not an object');
    });

    it('rejects index on relation', () => {
        assertValidatorRejects(`
            type Foo @rootEntity(indices:[{ fields: ["bar.baz"]}]) { bar: Bar @relation }
            type Bar @rootEntity { baz: String }
        `, 'Field "Foo.bar" resolves to a root entity, but indices can not cross root entity boundaries.');
    });

    it('rejects index on field of non-rootEntity', () => {
        assertValidatorRejects(`
            type Foo @valueObject { bar: String @unique }
        `, 'Indices are only allowed in root entity fields. You can add indices to fields of embedded objects with @rootEntities(indices: [...]).');
    });

    it('rejects index on field of non-rootEntity', () => {
        assertValidatorRejects(`
            type Foo @childEntity { bar: String @index }
        `, 'Indices are only allowed in root entity fields. You can add indices to fields of embedded objects with @rootEntities(indices: [...]).');
    });

});
