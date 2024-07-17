import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

export function checkField(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
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
