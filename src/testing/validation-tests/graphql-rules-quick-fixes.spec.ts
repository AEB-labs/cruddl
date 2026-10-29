import { describe, expect, it } from 'vitest';
import {
    applyQuickFix,
    assertValidatorAcceptsAndDoesNotWarn,
    assertValidatorRejects,
    validate,
} from '../utils/source-validation-utils.js';

describe('quick fixes for GraphQL rule errors', () => {
    function expectQuickFix(
        source: string,
        errors: string | ReadonlyArray<string>,
        description: string,
        expectedSource: string,
    ) {
        assertValidatorRejects(source, errors);
        const newSource = applyQuickFix(validate(source).messages, description);
        expect(newSource).to.equal(expectedSource);
        assertValidatorAcceptsAndDoesNotWarn(newSource);
    }

    it('offers to fix a misspelled directive', () => {
        expectQuickFix(
            `type Delivery @rootentity { deliveryNumber: String }`,
            'Unknown directive "@rootentity". Did you mean "@rootEntity"?',
            'Change to "@rootEntity"',
            `type Delivery @rootEntity { deliveryNumber: String }`,
        );
    });

    it('offers to fix a misspelled argument name', () => {
        expectQuickFix(
            `type Delivery @rootEntity(flexsearch: true) { deliveryNumber: String @flexSearch }`,
            'Unknown argument "flexsearch" on directive "@rootEntity". Did you mean "flexSearch" or "flexSearchOrder"?',
            'Change to "flexSearch"',
            `type Delivery @rootEntity(flexSearch: true) { deliveryNumber: String @flexSearch }`,
        );
    });

    it('offers to fix a misspelled enum value', () => {
        expectQuickFix(
            `type Delivery @rootEntity(flexSearch: true) { deliveryNumber: String @flexSearchFulltext(language: DEE) }`,
            'Value "DEE" does not exist in "FlexSearchLanguage" enum. Did you mean the enum value "DE", "EN", or "ES"?',
            'Change to "DE"',
            `type Delivery @rootEntity(flexSearch: true) { deliveryNumber: String @flexSearchFulltext(language: DE) }`,
        );
    });

    it('offers to fix a misspelled input field', () => {
        expectQuickFix(
            `type Delivery @rootEntity(indices: [{ field: ["deliveryNumber"] }]) { deliveryNumber: String }`,
            [
                'Field "IndexDefinition.fields" of required type "[String!]!" was not provided.',
                'Field "field" is not defined by type "IndexDefinition". Did you mean "fields" or "id"?',
            ],
            'Change to "fields"',
            `type Delivery @rootEntity(indices: [{ fields: ["deliveryNumber"] }]) { deliveryNumber: String }`,
        );
    });

    it('does not offer anything for unknown directives without a similar name', () => {
        const source = `type Delivery @rootEntity @foo { deliveryNumber: String }`;
        assertValidatorRejects(source, 'Unknown directive "@foo".');
        expect(validate(source).messages.flatMap((m) => m.quickFixes)).to.deep.equal([]);
    });
});
