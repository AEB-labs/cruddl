import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';

/**
 * Checks whether the @collect directives on the field and on the baseline fields match
 */
export function checkCollectField(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    // superfluous @collect
    if (fieldToCheck.isCollectField && !baselineField.isCollectField) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'COLLECT',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a collect field.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.collectAstNode },
            ),
        );
        return;
    }

    // no collect field on either side
    if (!baselineField.isCollectField) {
        return;
    }

    const expectedAggregateDeclaration = baselineField.aggregationOperator
        ? `aggregate: ${baselineField.aggregationOperator.toString()}`
        : '';

    // missing @collect
    if (!fieldToCheck.isCollectField) {
        const expectedPathDeclaration = `path: "${baselineField.collectPath?.path ?? ''}"`;
        const expectedCollectDeclaration = `@collect(${expectedPathDeclaration}${
            expectedAggregateDeclaration ? ', ' + expectedAggregateDeclaration : ''
        })`;
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'COLLECT',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedCollectDeclaration}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // wrong path
    if (
        fieldToCheck.collectPath &&
        baselineField.collectPath &&
        fieldToCheck.collectPath.path !== baselineField.collectPath.path
    ) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'COLLECT',
                `Path should be "${baselineField.collectPath.path}".`,
                fieldToCheck.astNode,
                { location: fieldToCheck.collectPathAstNode ?? fieldToCheck.collectAstNode },
            ),
        );
        return;
    }

    // superfluous aggregate
    if (fieldToCheck.aggregationOperator && !baselineField.aggregationOperator) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'COLLECT',
                `No aggregation should be used here.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.aggregationOperatorAstNode },
            ),
        );
    }

    // missing or wrong aggregate
    if (
        baselineField.aggregationOperator &&
        fieldToCheck.aggregationOperator !== baselineField.aggregationOperator
    ) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'COLLECT',
                `Collect field should specify ${expectedAggregateDeclaration}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.aggregationOperatorAstNode },
            ),
        );
    }
}
