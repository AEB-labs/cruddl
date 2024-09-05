import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether @root and @parent are specified exactly when they are specified in the baseline field
 */
export function checkRootAndParentDirectives(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    if (fieldToCheck.isRootField && !baselineField.isRootField) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'ROOT_FIELD',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be decorated with @root${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.rootDirectiveAstNode },
            ),
        );
    }

    if (!fieldToCheck.isRootField && baselineField.isRootField) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'ROOT_FIELD',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with @root${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
            ),
        );
    }

    if (fieldToCheck.isParentField && !baselineField.isParentField) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'PARENT_FIELD',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be decorated with @parent${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.parentDirectiveAstNode },
            ),
        );
    }

    if (!fieldToCheck.isParentField && baselineField.isParentField) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'PARENT_FIELD',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with @parent${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
            ),
        );
    }
}
