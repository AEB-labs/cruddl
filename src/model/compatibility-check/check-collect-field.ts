import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether the @collect directives on the field and on the baseline fields match
 */
export function checkCollectField(fieldToCheck: Field, baselineField: Field, context: ValidationContext) {
    // superfluous @collect
    if (fieldToCheck.isCollectField && !baselineField.isCollectField) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a collect field${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.collectAstNode,
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
            ValidationMessage.compatibilityIssue(
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedCollectDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
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
            ValidationMessage.compatibilityIssue(
                `Path should be "${baselineField.collectPath.path}"${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.collectPathAstNode ??
                    fieldToCheck.collectAstNode ??
                    fieldToCheck.astNode,
            ),
        );
        return;
    }

    // superfluous aggregate
    if (fieldToCheck.aggregationOperator && !baselineField.aggregationOperator) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `No aggregation should be used here${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.aggregationOperatorAstNode ?? fieldToCheck.astNode,
            ),
        );
    }

    // missing or wrong aggregate
    if (
        baselineField.aggregationOperator &&
        fieldToCheck.aggregationOperator !== baselineField.aggregationOperator
    ) {
        context.addMessage(
            ValidationMessage.compatibilityIssue(
                `Collect field should specify ${expectedAggregateDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.inverseOfAstNode ??
                    fieldToCheck.relationAstNode ??
                    fieldToCheck.astNode,
            ),
        );
    }
}
