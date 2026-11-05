import type { Field } from '../implementation/field.js';
import { getChangeFieldTypeQuickFixes } from '../implementation/field.js';
import { ValidationMessage } from '../validation/message.js';
import type { ValidationContext } from '../validation/validation-context.js';

/**
 * Checks whether the field has the same type as the baseline field, including whether or not they are lists
 */
export function checkFieldType(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    const expectedType = baselineField.isList
        ? '[' + baselineField.type.name + ']'
        : baselineField.type.name;
    const quickFixes = getChangeFieldTypeQuickFixes(fieldToCheck.astNode, expectedType);

    if (fieldToCheck.type.name !== baselineField.type.name) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FIELD_TYPE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" needs to be of type "${expectedType}".`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.astNode?.type,
                    quickFixes,
                },
            ),
        );
    } else if (fieldToCheck.isList && !baselineField.isList) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FIELD_TYPE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a list.`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.astNode?.type,
                    quickFixes,
                },
            ),
        );
    } else if (!fieldToCheck.isList && baselineField.isList) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'FIELD_TYPE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" needs to be a list.`,
                fieldToCheck.astNode,
                {
                    location: fieldToCheck.astNode?.type,
                    quickFixes,
                },
            ),
        );
    }
}
