import deepEqual from 'deep-equal';
import { print } from 'graphql';
import { createValueNodeFromValue } from '../../graphql/value-to-ast';
import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';

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
            ValidationMessage.suppressableCompatibilityIssue(
                'DEFAULT_VALUE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not have a default value.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.defaultValueAstNode },
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
            ValidationMessage.suppressableCompatibilityIssue(
                'DEFAULT_VALUE',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedDeclaration}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.defaultValueAstNode },
            ),
        );
        return;
    }

    // wrong default value
    if (!deepEqual(fieldToCheck.defaultValue, baselineField.defaultValue)) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'DEFAULT_VALUE',
                `Default value should be ${expectedDefaultValue}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.defaultValueAstNode },
            ),
        );
        return;
    }
}
