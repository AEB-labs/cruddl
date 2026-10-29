import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    validate,
} from '../utils/source-validation-utils.js';

const invalidSource = `
            type Test @rootEntity {
                other: Other2
                date: DateTime
            }
            
            type Other @rootEntity {
                field: String2
            }
        `;

const validSource = `
            type Test @rootEntity {
                other: Other @reference(keyField: "otherKey")
                otherKey: String
                date: DateTime
            }
            
            type Other @rootEntity {
                field: String @key
            }
        `;

describe('undefined-types validator', () => {
    it('points out missing types', () => {
        const validationResult = validate(invalidSource);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(2);
        expect(validationResult.messages[0].message).to.equal('Type "Other2" not found.');
        expect(validationResult.messages[1].message).to.equal('Type "String2" not found.');
    });

    it('accepts valid sources', () => {
        assertValidatorAcceptsAndDoesNotWarn(validSource);
    });

    it('offers to use a type with a similar name', () => {
        const newSource = applyQuickFix(
            validate(`
                type Delivery @rootEntity {
                    items: [DeliveryIten]
                }
                type DeliveryItem @childEntity {
                    itemNumber: String
                }
            `).messages,
            'Change to "DeliveryItem"',
        );
        expect(newSource).to.contain('items: [DeliveryItem]');
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    });
});
