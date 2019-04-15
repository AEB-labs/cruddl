import { assertValidatorAccepts, assertValidatorRejects, validate } from './helpers';
import { expect } from 'chai';

describe('references with key field', () => {
    it('accepts proper configuration', () => {
        assertValidatorAccepts(`
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
        assertValidatorRejects(`
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference(keyField: "stuffKey")
            }
        `, `"stuffKey" is not a field of  "stuff".`);
    });

    it('rejects system key field', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuff: Stuff @reference(keyField: "id")
            }
        `, `"id" is a system field and cannot be used as keyField of a @reference.`);
    });

    it('rejects ill-typed key field', () => {
        assertValidatorRejects(`
            type Stuff @rootEntity {
                key: String @key
            }
            type RefStuff @rootEntity {
                stuffKey: Int
                stuff: Stuff @reference(keyField: "stuffKey")
            }
        `, `The type of the key field "stuffKey" ("Int") must be the same as the type of the @key-annotated field "Stuff.key" ("String")`);
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
        expect(result.messages[0].message).to.equal(`There are multiple references declared on the key field "stuffKey".`);
        expect(result.messages[1].message).to.equal(`There are multiple references declared on the key field "stuffKey".`);
    });

});
