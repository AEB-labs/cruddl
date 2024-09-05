import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether the @reference directives on the field and on the baseline field match
 */
export function checkReference(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    if (fieldToCheck.isReference && !baselineField.isReference) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'REFERENCE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a reference${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.referenceAstNode,
                },
            ),
        );
        return;
    }

    // no reference on either side
    if (!baselineField.isReference) {
        return;
    }

    const expectedKeyFieldDeclaration =
        baselineField.referenceKeyField && baselineField.referenceKeyField !== baselineField
            ? `keyField: "${baselineField.referenceKeyField.name}"`
            : '';
    const expectedReferenceDeclaration = expectedKeyFieldDeclaration
        ? `@reference(${expectedKeyFieldDeclaration})`
        : `@reference`;

    // missing reference
    if (!fieldToCheck.isReference) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'REFERENCE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedReferenceDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // superfluous key field
    // field.referenceKeyField === field means no keyField arg is present
    if (
        fieldToCheck.referenceKeyField !== fieldToCheck &&
        baselineField.referenceKeyField === baselineField
    ) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'REFERENCE',
                `Reference should not declare a keyField${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.referenceAstNode,
                },
            ),
        );
        return;
    }

    if (baselineField.referenceKeyField === baselineField) {
        return;
    }

    // missing or wrong key field
    if (
        fieldToCheck.getReferenceKeyFieldOrThrow().name !==
        baselineField.getReferenceKeyFieldOrThrow().name
    ) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'REFERENCE',
                `Reference should declare ${expectedKeyFieldDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.referenceAstNode,
                },
            ),
        );
    }
}
