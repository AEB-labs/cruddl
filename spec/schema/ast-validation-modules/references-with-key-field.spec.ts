import {
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
    validate,
} from './helpers';
import { expect } from 'chai';

describe('references with key field', () => {
    it('accepts proper configuration', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuffKey: String
                stuff: Stuff @reference(keyField: "stuffKey")
            }
        `);
    });

    it('rejects missing key field', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference(keyField: "stuffKey")
            }
        `,
            `Field "RefStuff.stuffKey" not found.`,
        );
    });

    it('rejects system key field', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference(keyField: "id")
            }
        `,
            `"RefStuff.id" is a system field and cannot be used as keyField of a @reference.`,
        );
    });

    it('rejects ill-typed key field', () => {
        assertValidatorRejects(
            `
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuffKey: Int
                stuff: Stuff @reference(keyField: "stuffKey")
            }
        `,
            `The type of the keyField "RefStuff.stuffKey" ("Int") must be the same as the type of the @key-annotated field "Stuff.key" ("String")`,
        );
    });

    it('rejects doubly-used key field field', () => {
        const result = validate(`
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuffKey: String
                stuff1: Stuff @reference(keyField: "stuffKey")
                stuff2: Stuff @reference(keyField: "stuffKey")
            }
        `);
        expect(result.messages, result.messages.join('\n')).have.lengthOf(2);
        expect(result.messages[0].message).to.equal(
            `There are multiple references declared for keyField "stuffKey".`,
        );
        expect(result.messages[1].message).to.equal(
            `There are multiple references declared for keyField "stuffKey".`,
        );
    });

    it('warns about @reference without key field', () => {
        assertValidatorWarns(
            `
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference
            }
        `,
            `Usage of @reference without the keyField argument is deprecated. Add a field of type "String" and specify it in @reference(keyField: "...")`,
        );
    });
});
