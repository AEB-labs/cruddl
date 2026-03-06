import { ChangeSet, TextChange } from '../change-set/change-set.js';
import type { Field } from '../implementation/field.js';
import { QuickFix } from '../validation/index.js';
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
    const quickFixes: QuickFix[] = [];
    const expectedType = baselineField.isList
        ? '[' + baselineField.type.name + ']'
        : baselineField.type.name;
    if (fieldToCheck.astNode?.type.loc) {
        quickFixes.push(
            new QuickFix({
                description: `Change type to "${expectedType}"`,
                isPreferred: true,
                changeSet: new ChangeSet([
                    new TextChange(fieldToCheck.astNode.type.loc, expectedType),
                ]),
            }),
        );
    }

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
