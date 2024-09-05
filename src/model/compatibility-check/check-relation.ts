import { RelationDeleteAction } from '../config/field';
import { Field } from '../implementation';
import { ValidationContext, ValidationMessage } from '../validation';
import { getRequiredBySuffix } from './describe-module-specification';

/**
 * Checks whether the @relation directive on the field and on the baseline field match
 */
export function checkRelation(
    fieldToCheck: Field,
    baselineField: Field,
    context: ValidationContext,
) {
    // superfluous relation
    if (fieldToCheck.isRelation && !baselineField.isRelation) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'RELATION',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should not be a relation${getRequiredBySuffix(baselineField)}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.relationAstNode },
            ),
        );
        return;
    }

    // no relation on either side
    if (!baselineField.isRelation) {
        return;
    }

    const expectedInverseOfDeclaration = baselineField.inverseOf
        ? `inverseOf: "${baselineField.inverseOf.name}"`
        : '';
    const expectedOnDeleteDeclaration =
        baselineField.relationDeleteAction === RelationDeleteAction.REMOVE_EDGES
            ? '' // REMOVE_EDGES is the default and usually not specified explicitly
            : `onDelete: ${baselineField.relationDeleteAction.toString()}`;

    // missing relation
    if (!fieldToCheck.isRelation) {
        const expectedRelationDeclaration =
            expectedInverseOfDeclaration && expectedOnDeleteDeclaration
                ? `@relation(${expectedInverseOfDeclaration} ${expectedOnDeleteDeclaration})`
                : expectedInverseOfDeclaration || expectedOnDeleteDeclaration
                  ? `@relation(${expectedInverseOfDeclaration}${expectedOnDeleteDeclaration})`
                  : `@relation`;
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'RELATION',
                `Field "${baselineField.declaringType.name}.${
                    baselineField.name
                }" should be decorated with ${expectedRelationDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
            ),
        );
        return;
    }

    // superfluous inverseOf
    if (fieldToCheck.inverseOf && !baselineField.inverseOf) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'RELATION',
                `Relation "${
                    baselineField.name
                }" should be a forward relation, not an inverse relation${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.inverseOfAstNode },
            ),
        );
    }

    // missing or wrong inverseOf
    if (
        baselineField.inverseOf &&
        (!fieldToCheck.inverseOf || fieldToCheck.inverseOf.name !== baselineField.inverseOf.name)
    ) {
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'RELATION',
                `Relation "${
                    baselineField.name
                }" should be an inverse relation with ${expectedInverseOfDeclaration}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
                { location: fieldToCheck.inverseOfAstNode ?? fieldToCheck.relationAstNode },
            ),
        );
    }

    // wrong onDelete
    if (fieldToCheck.relationDeleteAction !== baselineField.relationDeleteAction) {
        // technically you can specify REMOVE_EDGES, but that's the default and nobody specifies that
        const hint = expectedOnDeleteDeclaration
            ? `specify ${expectedOnDeleteDeclaration}`
            : `omit the "onDelete" argument`;
        context.addMessage(
            ValidationMessage.suppressableCompatibilityIssue(
                'RELATION',
                `Relation "${baselineField.name}" should ${hint}${getRequiredBySuffix(
                    baselineField,
                )}.`,
                fieldToCheck.astNode,
                {
                    location:
                        fieldToCheck.relationDeleteActionAstNode ?? fieldToCheck.relationAstNode,
                },
            ),
        );
    }
}
