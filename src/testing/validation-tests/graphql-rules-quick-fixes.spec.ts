import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    validate,
} from '../utils/source-validation-utils.js';

describe('quick fixes for GraphQL rule errors', () => {
    function expectQuickFix(source: string, description: string, expectedSource: string) {
        const newSource = applyQuickFix(validate(source).messages, description);
        expect(newSource).to.equal(expectedSource);
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    }

    it('offers to fix a misspelled directive', () => {
        expectQuickFix(
            `type Delivery @rootentity { deliveryNumber: String }`,
            'Change to "@rootEntity"',
            `type Delivery @rootEntity { deliveryNumber: String }`,
        );
    });

    it('offers to fix a misspelled argument name', () => {
        expectQuickFix(
            `type Delivery @rootEntity(flexsearch: true) { deliveryNumber: String @flexSearch }`,
            'Change to "flexSearch"',
            `type Delivery @rootEntity(flexSearch: true) { deliveryNumber: String @flexSearch }`,
        );
    });

    it('offers to fix a misspelled enum value', () => {
        expectQuickFix(
            `type Delivery @rootEntity(flexSearch: true) { deliveryNumber: String @flexSearchFulltext(language: DEE) }`,
            'Change to "DE"',
            `type Delivery @rootEntity(flexSearch: true) { deliveryNumber: String @flexSearchFulltext(language: DE) }`,
        );
    });

    it('offers to fix a misspelled input field', () => {
        expectQuickFix(
            `type Delivery @rootEntity(indices: [{ field: ["deliveryNumber"] }]) { deliveryNumber: String }`,
            'Change to "fields"',
            `type Delivery @rootEntity(indices: [{ fields: ["deliveryNumber"] }]) { deliveryNumber: String }`,
        );
    });

    it('does not offer anything for unknown directives without a similar name', () => {
        const messages = validate(
            `type Delivery @rootEntity @foo { deliveryNumber: String }`,
        ).messages;
        expect(messages.flatMap((m) => m.quickFixes)).to.deep.equal([]);
    });
});
