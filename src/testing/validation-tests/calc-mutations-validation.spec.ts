import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorWarns,
    validate,
} from '../utils/source-validation-utils.js';

describe('calcMutations validation', () => {
    const schemaWithValueObject = `
            type Delivery @rootEntity {
                dimensions: Dimensions
            }
            type Dimensions @valueObject {
                weightInKg: Float @calcMutations(operators: [ADD])
            }
        `;

    it('warns about calcMutations in value objects', () => {
        assertValidatorWarns(
            schemaWithValueObject,
            'Calc mutations do not work within value objects because value objects cannot be updated. This will be an error in a future release.',
        );
    });

    it('offers to remove calcMutations in value objects', () => {
        const newSource = applyQuickFix(
            validate(schemaWithValueObject).messages,
            'Remove @calcMutations',
        );
        expect(newSource).to.contain('weightInKg: Float\n');
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    });
});
