import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
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
        assertValidatorRejects(invalidSource, [
            'Type "Other2" not found. Did you mean "Other"?',
            'Type "String2" not found. Did you mean "String"?',
        ]);
    });

    it('accepts valid sources', () => {
        assertValidatorAcceptsAndDoesNotWarn(validSource);
    });

    it('offers to use a type with a similar name', () => {
        const source = `
            type Delivery @rootEntity {
                items: [DeliveryIten]
            }
            type DeliveryItem @childEntity {
                itemNumber: String
            }
        `;
        assertValidatorRejects(
            source,
            'Type "DeliveryIten" not found. Did you mean "DeliveryItem"?',
        );
        const newSource = applyQuickFix(validate(source).messages, 'Change to "DeliveryItem"');
        expect(newSource).to.equal(source.replace('[DeliveryIten]', '[DeliveryItem]'));
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    });
});
