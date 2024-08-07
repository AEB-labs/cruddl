import { Field } from '../implementation/field';
import { ValidationMessage } from '../validation/message';
import { ValidationContext } from '../validation/validation-context';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether the field has the same type as the baseline field, including whether or not they are lists
 */
export function checkFieldType(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    if (fieldToCheck.type.name !== baselineField.type.name) {
        const expectedType = baselineField.isList
            ? '[' + baselineField.type.name + ']'
            : baselineField.type.name;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" needs to be of type "${expectedType}"${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode?.type,
            ),
        );
    } else if (fieldToCheck.isList && !baselineField.isList) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a list${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode?.type,
            ),
        );
    } else if (!fieldToCheck.isList && baselineField.isList) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" needs to be a list${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode?.type,
            ),
        );
    }
}
