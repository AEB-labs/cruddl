import { expect } from 'chai';
import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';

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
            'Only fields of type "String" and "Int" can be used as key field.');
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
            'Only fields of type "String" and "Int" can be used as key field.');
    });

    it('accepts correct key usage', () => {
        assertValidatorAccepts(`
            type Stuff @rootEntity {
                foo: String @key
            }
        `);
    });
});
