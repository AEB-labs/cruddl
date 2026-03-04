import { describe, expect, it } from 'vitest';
import {
    assertValidatorAcceptsAndDoesNotWarn,
    validate,
} from '../utils/source-validation-utils.js';

const modelWithNonUniqueFields = `
            type Stuff @rootEntity {
                foo: String @key
                foo: String 
            }
        `;

describe('unique field validator', () => {
    it('finds non-unique fields', () => {
        const validationResult = validate(modelWithNonUniqueFields);
        expect(validationResult.hasErrors()).to.be.true;
        expect(validationResult.messages.length).to.equal(2);
    });

    it('finds no problems', () => {
        assertValidatorAcceptsAndDoesNotWarn(`
            type Stuff @rootEntity {
                foo: String @key
                bar: [Bar]
            }
            type Bar @childEntity {
                count: Int
            }
        `);
    });
});
