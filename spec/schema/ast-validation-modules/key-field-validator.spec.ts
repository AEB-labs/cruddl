import { expect } from 'chai';
import {
    assertValidatorAccepts, assertValidatorAcceptsAndDoesNotWarn, assertValidatorRejects, assertValidatorWarns, validate
} from './helpers';

describe('key field validator', () => {
    it('finds duplicate key usage', () => {
        const validationResult = validate(`
            type Stuff @rootEntity {
                foo: String @key
                bar: String @key
            }
        `);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length, validationResult.toString()).to.equal(2);
        expect(validationResult.messages[0].message).to.equal('Only one field can be a @key field.');
        expect(validationResult.messages[1].message).to.equal('Only one field can be a @key field.');
    });

    it('finds bad type usage', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                foo: String
                bar: Bar @key
            }
            type Bar @valueObject {
                count: Int
            }
        `,
            'Only fields of type "String", "Int", and "ID" can be used as key field.');
    });

    it('finds bad list type usage', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                foo: String
                bar: [Int] @key
            }
        `,
            'List fields cannot be used as key field.');
    });

    it('finds bad object type usage', () => {
        assertValidatorRejects(`
            type Stuff @childEntity {
                foo: String @key
            }
        `,
            'A @key field can only be declared on root entities.');
    });

    it('disallows keys on fields which are not String or Int', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                foo: String
                bar: JSON @key
            }
        `,
            'Only fields of type "String", "Int", and "ID" can be used as key field.');
    });

    it('accepts correct key usage', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String @key
            }
        `);
    });

    it('accepts id: ID @key', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                id: ID @key
            }
        `);
    });

    it('warns about id: ID (without @key)', () => {
        assertValidatorWarns(`
            type Stuff @rootEntity {
                id: ID
            }
        `, 'The field "id" is redundant and should only be explicitly added when used with @key.');
    });

    it('warns about _key: String (without @key)', () => {
        assertValidatorWarns(`
            type Stuff @rootEntity {
                _key: String @key
            }
        `, 'The field "_key" is deprecated and should be replaced with "id" (of type "ID").');
    });

    it('rejects id: String @key (wrong type)', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                id: String @key
            }
        `, 'The field "id" must be of type "ID".');
    });

    it('rejects id: String (wrong type, without @key)', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                id: String
            }
        `, 'The field "id" must be of type "ID".');
    });

    it('rejects _key: String (without @key)', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                _key: String
            }
        `, 'The field name "_key" is reserved and can only be used in combination with @key.');
    });

    // just to make it clear - _key is an exception here.
    it('rejects other fields starting with an underscore', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                _internal: String
            }
        `, 'Field names cannot start with an underscore.');
    });
});
