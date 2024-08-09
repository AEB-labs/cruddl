import deepEqual from 'deep-equal';
import { print } from 'graphql';
import { createValueNodeFromValue } from '../../graphql/value-to-ast';
import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether the @defaultValue directive on the field and on the basleine field match
 */
export function checkDefaultValue(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    // superfluous @defaultValue
    if (
        fieldToCheck.hasDefaultValue &&
        fieldToCheck.defaultValue !== null &&
        !baselineField.hasDefaultValue
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not have a default value${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.defaultValueAstNode ?? fieldToCheck.astNode,
            ),
        );
        return;
    }

    // no default value on either side
    if (!baselineField.hasDefaultValue || baselineField.defaultValue === null) {
        return;
    }

    const expectedDefaultValue = print(createValueNodeFromValue(baselineField.defaultValue));

    // missing @defaultValue
    if (!fieldToCheck.hasDefaultValue) {
        const expectedDeclaration = `@defaultValue(value: ${expectedDefaultValue})`;
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // wrong default value
    if (!deepEqual(fieldToCheck.defaultValue, baselineField.defaultValue)) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Default value should be ${expectedDefaultValue}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }
}
