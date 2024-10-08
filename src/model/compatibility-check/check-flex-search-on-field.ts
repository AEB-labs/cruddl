import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import {
    FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE,
    FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT,
    FLEX_SEARCH_INDEXED_DIRECTIVE,
} from '../../schema/constants';

export function checkFlexSearchOnField(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    checkRegularDirective(fieldToCheck, baselineField, context);
    checkFulltextDirective(fieldToCheck, baselineField, context);
}

export function checkRegularDirective(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    if (!baselineField.isFlexSearchIndexed) {
        // if the baseline does not use flexSearch, the field to check is free to do anything
        return;
    }
    if (!fieldToCheck.isFlexSearchIndexed) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FLEX_SEARCH',
                `Field "${baselineField.name}" should enable @${FLEX_SEARCH_INDEXED_DIRECTIVE}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    if (baselineField.isIncludedInSearch && !fieldToCheck.isIncludedInSearch) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FLEX_SEARCH_SEARCH',
                `Field "${
                    baselineField.name
                }" should enable @${FLEX_SEARCH_INDEXED_DIRECTIVE}(${FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT}: true).`,
                fieldToCheck.astNode,
                { location: fieldToCheck.isFlexSearchIndexedAstNode },
            ),
        );
    }
}

export function checkFulltextDirective(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    if (!baselineField.isFlexSearchFulltextIndexed) {
        // if the baseline does not use flexSearch, the field to check is free to do anything
        return;
    }
    if (!fieldToCheck.isFlexSearchFulltextIndexed) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FLEX_SEARCH',
                `Field "${
                    baselineField.name
                }" should enable @${FLEX_SEARCH_FULLTEXT_INDEXED_DIRECTIVE}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    if (baselineField.isFulltextIncludedInSearch && !fieldToCheck.isFulltextIncludedInSearch) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FLEX_SEARCH_SEARCH',
                `Field "${
                    baselineField.name
                }" should enable @${FLEX_SEARCH_INDEXED_DIRECTIVE}(${FLEX_SEARCH_INCLUDED_IN_SEARCH_ARGUMENT}: true).`,
                fieldToCheck.astNode,
                { location: fieldToCheck.isFlexSearchFullTextIndexedAstNode },
            ),
        );
    }
}
