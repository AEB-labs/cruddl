import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    assertValidatorWarns,
    validate,
} from '../utils/source-validation-utils.js';

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

    it('offers to change the type of an ill-typed key field', () => {
        const newSource = applyQuickFix(
            validate(`
                type Stuff @rootEntity {
                    key: String @key
                }
                type RefStuff @rootEntity {
                    stuffKey: Int
                    stuff: Stuff @reference(keyField: "stuffKey")
                }
            `).messages,
            'Change type of "RefStuff.stuffKey" to "String"',
        );
        expect(newSource).to.contain('stuffKey: String\n');
        assertValidatorAcceptsAndDoesNotWarn(newSource);
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

    it('offers to use a key field with a similar name', () => {
        const newSource = applyQuickFix(
            validate(`
                type Stuff @rootEntity {
                    key: String @key
                }
                type RefStuff @rootEntity {
                    stuffKey: String
                    stuff: Stuff @reference(keyField: "stufKey")
                }
            `).messages,
            'Change to "stuffKey"',
        );
        expect(newSource).to.contain('@reference(keyField: "stuffKey")');
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    });
});
